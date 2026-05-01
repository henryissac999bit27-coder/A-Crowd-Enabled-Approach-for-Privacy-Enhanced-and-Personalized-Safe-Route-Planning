// flService.js
// Federated Learning - Personalized beta Impact Weights
// Extends: Islam et al. IEEE TKDE 2023, Section 5 + Section 10
// FedAvg Algorithm (McMahan et al. 2017)

const db = require('../config/db');

// Hyperparameters
const HP = {
    LOCAL_EPOCHS:      50,
    LEARNING_RATE:     0.01,
    LR_DECAY:          0.95,
    MOMENTUM:          0.9,
    EARLY_STOP_DELTA:  0.001,
    EARLY_STOP_ROUNDS: 5,
    CONVERGENCE_DELTA: 0.005,
    MIN_PARTICIPANTS:  2,
    DEFAULT_BETA:     -2.0,
    S:                 10,
};

// Feature extraction
function extractFeatures(event) {
    const maxCrimes = event.max_count || 500;
    return [
        Math.min(event.crime_count / maxCrimes, 1.0),
        Math.sin(2 * Math.PI * (event.hour || 12) / 24),
        (event.dayOfWeek === 0 || event.dayOfWeek === 6) ? 1 : 0,
        Math.min((event.nearby_count || 0) / maxCrimes, 1.0),
    ];
}

// Predict beta from weights and features
function predictBeta(weights, features) {
    const raw = weights[0]
        + weights[1] * features[0]
        + weights[2] * features[1]
        + weights[3] * features[2]
        + weights[4] * features[3];
    return Math.max(-HP.S, Math.min(-0.5, raw));
}

// Local training with SGD + Momentum + early stopping
function trainLocalModelFull(initWeights, trainingData, learningRate) {
    if (!trainingData || trainingData.length === 0) {
        return { weights: initWeights, finalLoss: 999, epochsRun: 0, lossHistory: [] };
    }

    var weights      = initWeights.slice();
    var velocity     = [0, 0, 0, 0, 0];
    var prevLoss     = Infinity;
    var noImprovCount = 0;
    var lossHistory  = [];

    for (var epoch = 0; epoch < HP.LOCAL_EPOCHS; epoch++) {
        var shuffled   = trainingData.slice().sort(function() { return Math.random() - 0.5; });
        var epochLoss  = 0;
        var gradients  = [0, 0, 0, 0, 0];

        for (var s = 0; s < shuffled.length; s++) {
            var sample   = shuffled[s];
            var features = extractFeatures(sample);
            var predicted = predictBeta(weights, features);
            var gaussianW = sample.gaussian_weight || 1.0;
            var target    = Math.max(-HP.S, Math.min(-0.5,
                gaussianW > 0.01 ? sample.pss / gaussianW : HP.DEFAULT_BETA
            ));

            var error = predicted - target;
            epochLoss += error * error;

            gradients[0] += 2 * error * 1;
            gradients[1] += 2 * error * features[0];
            gradients[2] += 2 * error * features[1];
            gradients[3] += 2 * error * features[2];
            gradients[4] += 2 * error * features[3];
        }

        var n = shuffled.length;
        for (var i = 0; i < 5; i++) {
            gradients[i] /= n;
            velocity[i]   = HP.MOMENTUM * velocity[i] + learningRate * gradients[i];
            weights[i]   -= velocity[i];
        }

        var avgLoss = epochLoss / n;
        lossHistory.push(parseFloat(avgLoss.toFixed(6)));

        var improvement = prevLoss - avgLoss;
        if (improvement < HP.EARLY_STOP_DELTA) {
            noImprovCount++;
            if (noImprovCount >= HP.EARLY_STOP_ROUNDS) {
                return { weights: weights, finalLoss: avgLoss, epochsRun: epoch + 1, lossHistory: lossHistory };
            }
        } else {
            noImprovCount = 0;
        }
        prevLoss = avgLoss;
    }

    var lastLoss = lossHistory[lossHistory.length - 1] || 999;
    return { weights: weights, finalLoss: lastLoss, epochsRun: HP.LOCAL_EPOCHS, lossHistory: lossHistory };
}

// FedAvg aggregation
function fedAvgAggregate(userModels) {
    var total = userModels.reduce(function(s, m) { return s + m.samples; }, 0);
    if (total === 0) return [HP.DEFAULT_BETA, 0, 0, 0, 0];
    var agg = [0, 0, 0, 0, 0];
    for (var j = 0; j < userModels.length; j++) {
        var w = userModels[j].samples / total;
        for (var i = 0; i < 5; i++) agg[i] += w * userModels[j].weights[i];
    }
    return agg;
}

// Run a single FL round
async function runFLRound() {
    console.log('\n[FL] Starting FL round...');

    var globalRows  = await db.query('SELECT * FROM fl_global_model WHERE id=1');
    var globalModel = globalRows[0][0];
    var currentRound = (globalModel ? globalModel.round : 0) + 1;
    var currentLR    = HP.LEARNING_RATE * Math.pow(HP.LR_DECAY, currentRound - 1);

    var globalWeights = [
        globalModel ? globalModel.w0 : HP.DEFAULT_BETA,
        globalModel ? globalModel.w1 : 0,
        globalModel ? globalModel.w2 : 0,
        globalModel ? globalModel.w3 : 0,
        globalModel ? globalModel.w4 : 0,
    ];
    var prevGlobalLoss = globalModel ? (globalModel.avg_loss || 999) : 999;

    console.log('[FL] Round ' + currentRound + ' | LR=' + currentLR.toFixed(5) + ' | beta0=' + globalWeights[0].toFixed(4));

    var usersResult = await db.query('SELECT user_id, username FROM users');
    var users = usersResult[0];

    var maxRowResult = await db.query('SELECT MAX(crime_count) as max_count FROM safety_scores');
    var maxCount = maxRowResult[0][0] ? maxRowResult[0][0].max_count : 500;

    if (users.length < HP.MIN_PARTICIPANTS) {
        return { error: 'Not enough users.' };
    }

    var userModels = [];

    for (var u = 0; u < users.length; u++) {
        var user = users[u];

        var pssResult = await db.query(
            'SELECT up.grid_x, up.grid_y, up.pss, COALESCE(ss.crime_count,0) AS crime_count, ' +
            'HOUR(up.last_updated) AS hour, DAYOFWEEK(up.last_updated) AS dayOfWeek, ' +
            '(SELECT COUNT(*) FROM user_pss up2 WHERE up2.user_id=up.user_id ' +
            'AND ABS(up2.grid_x-up.grid_x)<=2 AND ABS(up2.grid_y-up.grid_y)<=2) AS nearby_count ' +
            'FROM user_pss up LEFT JOIN safety_scores ss ON ss.grid_x=up.grid_x AND ss.grid_y=up.grid_y ' +
            'WHERE up.user_id=? AND up.pss<0 LIMIT 300',
            [user.user_id]
        );
        var pssData = pssResult[0];

        if (pssData.length === 0) continue;

        var trainingData = pssData.map(function(r) {
            return Object.assign({}, r, { max_count: maxCount, gaussian_weight: 1.0 });
        });

        var localResult = await db.query('SELECT w0,w1,w2,w3,w4 FROM user_fl_weights WHERE user_id=?', [user.user_id]);
        var localRows   = localResult[0];
        var initWeights = localRows.length > 0
            ? [localRows[0].w0, localRows[0].w1, localRows[0].w2, localRows[0].w3, localRows[0].w4]
            : globalWeights.slice();

        var trained = trainLocalModelFull(initWeights, trainingData, currentLR);

        console.log('[FL]   ' + user.username + ' samples=' + trainingData.length +
            ' epochs=' + trained.epochsRun + ' loss=' + trained.finalLoss.toFixed(4) +
            ' beta0=' + trained.weights[0].toFixed(4));

        await db.query(
            'INSERT INTO user_fl_weights (user_id,w0,w1,w2,w3,w4,loss,round) VALUES (?,?,?,?,?,?,?,?) ' +
            'ON DUPLICATE KEY UPDATE w0=?,w1=?,w2=?,w3=?,w4=?,loss=?,round=?',
            [user.user_id].concat(trained.weights).concat([trained.finalLoss, currentRound])
                         .concat(trained.weights).concat([trained.finalLoss, currentRound])
        );

        userModels.push({
            userId:    user.user_id,
            weights:   trained.weights,
            samples:   trainingData.length,
            loss:      trained.finalLoss,
            epochsRun: trained.epochsRun,
        });
    }

    if (userModels.length < HP.MIN_PARTICIPANTS) {
        return { error: 'Not enough trained users.' };
    }

    var newGlobal  = fedAvgAggregate(userModels);
    var avgLoss    = userModels.reduce(function(s, m) { return s + m.loss; }, 0) / userModels.length;
    var avgEpochs  = Math.round(userModels.reduce(function(s, m) { return s + m.epochsRun; }, 0) / userModels.length);
    var converged  = Math.abs(prevGlobalLoss - avgLoss) < HP.CONVERGENCE_DELTA;

    console.log('[FL] FedAvg: beta0=' + newGlobal[0].toFixed(4) + ' avgLoss=' + avgLoss.toFixed(4) + ' converged=' + converged);

    await db.query(
        'UPDATE fl_global_model SET w0=?,w1=?,w2=?,w3=?,w4=?,round=?,participants=?,updated_at=NOW() WHERE id=1',
        newGlobal.concat([currentRound, userModels.length])
    );

    await db.query(
        'INSERT INTO fl_rounds (round,participants,avg_loss,global_w0,global_w1,global_w2,global_w3,global_w4) ' +
        'VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE participants=?,avg_loss=?',
        [currentRound, userModels.length, avgLoss].concat(newGlobal).concat([userModels.length, avgLoss])
    );

    return {
        round:        currentRound,
        participants: userModels.length,
        avgLoss:      parseFloat(avgLoss.toFixed(6)),
        avgEpochs:    avgEpochs,
        globalWeights: newGlobal,
        converged:    converged,
        learningRate: currentLR,
    };
}

// Auto-train until convergence
async function trainUntilConvergence(maxRounds) {
    maxRounds = maxRounds || 20;
    console.log('[FL] Auto-training for up to ' + maxRounds + ' rounds...');
    var history  = [];
    var prevLoss = Infinity;

    for (var i = 0; i < maxRounds; i++) {
        var result = await runFLRound();
        if (result.error) break;

        history.push({ round: result.round, loss: result.avgLoss, beta0: result.globalWeights[0], epochs: result.avgEpochs });

        var improvement = prevLoss - result.avgLoss;
        if (result.converged || improvement < HP.CONVERGENCE_DELTA) {
            console.log('[FL] Converged at round ' + result.round);
            return { rounds: result.round, finalLoss: result.avgLoss, finalBeta: result.globalWeights[0], converged: true, history: history };
        }
        prevLoss = result.avgLoss;
    }

    var last = history[history.length - 1] || {};
    return { rounds: history.length, finalLoss: last.loss, finalBeta: last.beta0, converged: false, history: history };
}

// Get personalized beta for a user
async function getPersonalizedBeta(userId, context) {
    try {
        var weights;
        if (userId) {
            var r = await db.query('SELECT w0,w1,w2,w3,w4 FROM user_fl_weights WHERE user_id=?', [userId]);
            if (r[0].length > 0) weights = [r[0][0].w0, r[0][0].w1, r[0][0].w2, r[0][0].w3, r[0][0].w4];
        }
        if (!weights) {
            var g = await db.query('SELECT w0,w1,w2,w3,w4 FROM fl_global_model WHERE id=1');
            if (g[0].length > 0) weights = [g[0][0].w0, g[0][0].w1, g[0][0].w2, g[0][0].w3, g[0][0].w4];
        }
        if (!weights) return HP.DEFAULT_BETA;
        return predictBeta(weights, extractFeatures(context));
    } catch (e) { return HP.DEFAULT_BETA; }
}

// Get FL status
async function getFLStatus() {
    var globalRes  = await db.query('SELECT * FROM fl_global_model WHERE id=1');
    var histRes    = await db.query('SELECT * FROM fl_rounds ORDER BY round DESC LIMIT 20');
    var usersRes   = await db.query(
        'SELECT u.username,f.w0,f.loss,f.round,f.updated_at FROM user_fl_weights f ' +
        'JOIN users u ON u.user_id=f.user_id ORDER BY f.loss ASC'
    );

    var global  = globalRes[0][0]  || null;
    var history = histRes[0];
    var users   = usersRes[0];

    var losses  = history.map(function(r) { return r.avg_loss; }).reverse();
    var deltas  = losses.slice(1).map(function(l, i) { return Math.abs(losses[i] - l); });
    var lastDelta = deltas.length > 0 ? deltas[deltas.length - 1] : null;

    return {
        globalModel:  global,
        roundHistory: history,
        userModels:   users,
        defaultBeta:  HP.DEFAULT_BETA,
        hyperparameters: {
            localEpochs:      HP.LOCAL_EPOCHS,
            learningRate:     HP.LEARNING_RATE,
            lrDecay:          HP.LR_DECAY,
            momentum:         HP.MOMENTUM,
            earlyStopDelta:   HP.EARLY_STOP_DELTA,
            convergenceDelta: HP.CONVERGENCE_DELTA,
        },
        convergenceAnalysis: {
            lastLossDelta:   lastDelta ? parseFloat(lastDelta.toFixed(6)) : null,
            isConverged:     lastDelta !== null && lastDelta < HP.CONVERGENCE_DELTA,
            roundsCompleted: history.length,
            recommendation:
                lastDelta === null      ? 'Run first round' :
                lastDelta > 0.1         ? 'Still training - run more rounds' :
                lastDelta > 0.01        ? 'Nearly converged - run 2-3 more' :
                                          'Converged - model is stable',
        },
        description: {
            algorithm:   'FedAvg with SGD+Momentum (McMahan et al. 2017)',
            model:       'Linear: beta = w0 + w1*severity + w2*hour + w3*weekend + w4*density',
            novelty:     'Paper Section 5 uses fixed beta=-2. FL learns personalized beta per user.',
            paperFuture: 'Implements paper Section 10: learn impact values of various event types',
        },
    };
}

module.exports = {
    runFLRound:             runFLRound,
    trainUntilConvergence:  trainUntilConvergence,
    getPersonalizedBeta:    getPersonalizedBeta,
    getFLStatus:            getFLStatus,
    fedAvgAggregate:        fedAvgAggregate,
    trainLocalModelFull:    trainLocalModelFull,
    predictBeta:            predictBeta,
    extractFeatures:        extractFeatures,
    DEFAULT_BETA:           HP.DEFAULT_BETA,
    HP:                     HP,
};
