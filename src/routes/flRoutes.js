// flRoutes.js - Federated Learning API endpoints
//
//   POST /api/fl/round   - run ONE FL round
//   POST /api/fl/train   - auto-train until convergence
//   GET  /api/fl/status  - model weights, history, convergence
//   GET  /api/fl/beta    - personalized beta for a user + context

const express = require('express');
const router  = express.Router();

const fl = require('../services/flService');

// POST /api/fl/round - run one FL round manually
router.post('/round', async function(req, res) {
    try {
        var result = await fl.runFLRound();
        if (result.error) return res.status(400).json({ error: result.error });

        res.json({
            message:       'FL round ' + result.round + ' complete.',
            round:          result.round,
            participants:   result.participants,
            avgLoss:        result.avgLoss,
            avgEpochsRun:   result.avgEpochs,
            learningRate:   parseFloat(result.learningRate.toFixed(6)),
            globalBeta0:    parseFloat(result.globalWeights[0].toFixed(4)),
            defaultBeta:    fl.DEFAULT_BETA,
            converged:      result.converged,
            interpretation: 'Beta changed from ' + fl.DEFAULT_BETA + ' to ' + result.globalWeights[0].toFixed(4) + '. ' +
                (result.converged ? 'Model has CONVERGED.' : 'Still training - run more rounds.'),
        });
    } catch (err) {
        console.error('[FL round]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/fl/train - auto-train until convergence
// Body (optional): { "maxRounds": 20 }
router.post('/train', async function(req, res) {
    try {
        var maxRounds = parseInt((req.body && req.body.maxRounds) || 20);
        console.log('[FL] Auto-train started maxRounds=' + maxRounds + ' epochs=' + fl.HP.LOCAL_EPOCHS);

        var result = await fl.trainUntilConvergence(maxRounds);

        res.json({
            message:    result.converged
                ? 'FL converged after ' + result.rounds + ' rounds.'
                : 'FL ran ' + result.rounds + ' rounds (max reached, not fully converged).',
            roundsRun:   result.rounds,
            finalLoss:   result.finalLoss ? parseFloat(result.finalLoss.toFixed(6)) : null,
            finalBeta:   result.finalBeta ? parseFloat(result.finalBeta.toFixed(4)) : null,
            defaultBeta: fl.DEFAULT_BETA,
            converged:   result.converged,
            lossHistory: (result.history || []).map(function(h) {
                return {
                    round:     h.round,
                    loss:      parseFloat(h.loss.toFixed(4)),
                    beta0:     parseFloat(h.beta0.toFixed(4)),
                    avgEpochs: h.epochs,
                };
            }),
            hyperparameters: {
                localEpochs:  fl.HP.LOCAL_EPOCHS,
                learningRate: fl.HP.LEARNING_RATE,
                lrDecay:      fl.HP.LR_DECAY,
                momentum:     fl.HP.MOMENTUM,
            },
            interpretation: result.finalBeta
                ? 'Paper default beta=' + fl.DEFAULT_BETA + '. FL learned beta=' + result.finalBeta.toFixed(4) + '. ' +
                  'Crowd perceives danger ' + (Math.abs(result.finalBeta) / Math.abs(fl.DEFAULT_BETA)).toFixed(1) + 'x stronger than paper assumed.'
                : 'Training did not produce results.',
        });
    } catch (err) {
        console.error('[FL train]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/fl/status
router.get('/status', async function(req, res) {
    try {
        res.json(await fl.getFLStatus());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/fl/beta?userId=&crimeCount=200&hour=22&dayOfWeek=5&nearbyCount=300&maxCount=500
router.get('/beta', async function(req, res) {
    try {
        var q = req.query;
        var context = {
            crime_count:  parseFloat(q.crimeCount  || 200),
            hour:         parseFloat(q.hour        || 12),
            dayOfWeek:    parseFloat(q.dayOfWeek   || 3),
            nearby_count: parseFloat(q.nearbyCount || 100),
            max_count:    parseFloat(q.maxCount    || 500),
        };

        var beta = await fl.getPersonalizedBeta(q.userId || null, context);

        res.json({
            userId:           q.userId || 'global',
            context:          context,
            personalizedBeta: parseFloat(beta.toFixed(4)),
            defaultBeta:      fl.DEFAULT_BETA,
            difference:       parseFloat((beta - fl.DEFAULT_BETA).toFixed(4)),
            interpretation:
                beta < fl.DEFAULT_BETA
                    ? 'Perceives area as MORE dangerous (beta=' + beta.toFixed(2) + ' vs default ' + fl.DEFAULT_BETA + ')'
                    : 'Perceives area as LESS dangerous (beta=' + beta.toFixed(2) + ' vs default ' + fl.DEFAULT_BETA + ')',
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
