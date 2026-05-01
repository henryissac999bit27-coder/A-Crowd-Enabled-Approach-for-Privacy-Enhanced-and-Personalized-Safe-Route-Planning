"""
fl_model.py
===========
Python implementation of the Federated Learning module from flService.js
Exact port of:
  - extractFeatures()
  - predictBeta()
  - trainLocalModelFull()
  - fedAvgAggregate()
  - runFLRound()
  - trainUntilConvergence()
  - getPersonalizedBeta()

Algorithm : FedAvg (McMahan et al. 2017) + SGD Momentum
Model     : β = w0 + w1×severity + w2×hour + w3×weekend + w4×density
Reference : Islam et al. IEEE TKDE 2023 — Section 5 + Section 10
"""

import math
import random
import json
import pickle
import os
import mysql.connector
from datetime import datetime
from typing import List, Dict, Optional, Tuple

# ─── DB config (matches your db.js) ──────────────────────────────────────────
DB_CONFIG = {
    'host':     'localhost',
    'user':     'root',
    'password': 'henry@258',
    'database': 'safe_route',
}

def get_db():
    return mysql.connector.connect(**DB_CONFIG)

# ─── Hyperparameters (exact match with flService.js HP) ──────────────────────
HP = {
    'LOCAL_EPOCHS':      50,
    'LEARNING_RATE':     0.01,
    'LR_DECAY':          0.95,
    'MOMENTUM':          0.9,
    'EARLY_STOP_DELTA':  0.001,
    'EARLY_STOP_ROUNDS': 5,
    'CONVERGENCE_DELTA': 0.005,
    'MIN_PARTICIPANTS':  2,
    'DEFAULT_BETA':     -2.0,
    'S':                 10,
}

# ═════════════════════════════════════════════════════════════════════════════
# FEATURE EXTRACTION
# Matches extractFeatures() in flService.js exactly
# ═════════════════════════════════════════════════════════════════════════════
def extract_features(event: dict) -> List[float]:
    """
    Extract 4 features from a crime/safety event record.

    Features:
        [0] crime_severity  = crime_count / max_count   (normalised 0-1)
        [1] hour_sin        = sin(2π × hour / 24)       (cyclic encoding)
        [2] is_weekend      = 1 if Saturday or Sunday, else 0
        [3] area_density    = nearby_count / max_count  (normalised 0-1)
    """
    max_crimes = event.get('max_count', 500)
    hour       = event.get('hour', 12)
    dow        = event.get('dayOfWeek', 1)   # 1=Sunday ... 7=Saturday (MySQL DAYOFWEEK)
    nearby     = event.get('nearby_count', 0)

    return [
        min(event.get('crime_count', 0) / max_crimes, 1.0),
        math.sin(2 * math.pi * hour / 24),
        1.0 if dow in (1, 7) else 0.0,          # Sunday=1, Saturday=7 in MySQL
        min(nearby / max_crimes, 1.0),
    ]


# ═════════════════════════════════════════════════════════════════════════════
# PREDICT BETA
# Matches predictBeta() in flService.js exactly
# ═════════════════════════════════════════════════════════════════════════════
def predict_beta(weights: List[float], features: List[float]) -> float:
    """
    Linear model: β = w0 + w1*f0 + w2*f1 + w3*f2 + w4*f3
    Clipped to [-S, -0.5] to keep β negative (danger perception)
    """
    S = HP['S']
    raw = (weights[0]
           + weights[1] * features[0]
           + weights[2] * features[1]
           + weights[3] * features[2]
           + weights[4] * features[3])
    return max(-S, min(-0.5, raw))


# ═════════════════════════════════════════════════════════════════════════════
# LOCAL TRAINING — SGD + Momentum + Early Stopping
# Matches trainLocalModelFull() in flService.js exactly
# ═════════════════════════════════════════════════════════════════════════════
def train_local_model(
    init_weights: List[float],
    training_data: List[dict],
    learning_rate: float
) -> dict:
    """
    Train a local model on one user's pSS data.

    Args:
        init_weights  : starting weights [w0..w4] from global model
        training_data : list of event dicts with keys:
                        crime_count, hour, dayOfWeek, nearby_count,
                        pss, gaussian_weight, max_count
        learning_rate : current round LR (decayed each round)

    Returns:
        dict with keys: weights, final_loss, epochs_run, loss_history
    """
    if not training_data:
        return {
            'weights':      init_weights[:],
            'final_loss':   999.0,
            'epochs_run':   0,
            'loss_history': [],
        }

    S          = HP['S']
    weights    = init_weights[:]
    velocity   = [0.0] * 5
    prev_loss  = float('inf')
    no_improv  = 0
    loss_history = []

    for epoch in range(HP['LOCAL_EPOCHS']):

        # Shuffle training data each epoch (matches JS sort shuffle)
        shuffled = training_data[:]
        random.shuffle(shuffled)

        epoch_loss = 0.0
        gradients  = [0.0] * 5

        for sample in shuffled:
            features  = extract_features(sample)
            predicted = predict_beta(weights, features)
            gw        = sample.get('gaussian_weight', 1.0)

            # Target: clipped pSS / gaussian_weight
            if gw > 0.01:
                target = max(-S, min(-0.5, sample['pss'] / gw))
            else:
                target = HP['DEFAULT_BETA']

            error      = predicted - target
            epoch_loss += error * error

            # Gradients of MSE loss
            gradients[0] += 2 * error * 1.0
            gradients[1] += 2 * error * features[0]
            gradients[2] += 2 * error * features[1]
            gradients[3] += 2 * error * features[2]
            gradients[4] += 2 * error * features[3]

        n = len(shuffled)
        for i in range(5):
            gradients[i] /= n
            # SGD + Momentum: v = 0.9v + lr*grad;  w = w - v
            velocity[i]   = HP['MOMENTUM'] * velocity[i] + learning_rate * gradients[i]
            weights[i]   -= velocity[i]

        avg_loss = epoch_loss / n
        loss_history.append(round(avg_loss, 6))

        # Early stopping
        improvement = prev_loss - avg_loss
        if improvement < HP['EARLY_STOP_DELTA']:
            no_improv += 1
            if no_improv >= HP['EARLY_STOP_ROUNDS']:
                return {
                    'weights':      weights,
                    'final_loss':   avg_loss,
                    'epochs_run':   epoch + 1,
                    'loss_history': loss_history,
                }
        else:
            no_improv = 0

        prev_loss = avg_loss

    return {
        'weights':      weights,
        'final_loss':   loss_history[-1] if loss_history else 999.0,
        'epochs_run':   HP['LOCAL_EPOCHS'],
        'loss_history': loss_history,
    }


# ═════════════════════════════════════════════════════════════════════════════
# FEDAVG AGGREGATION
# Matches fedAvgAggregate() in flService.js exactly
# ═════════════════════════════════════════════════════════════════════════════
def fed_avg_aggregate(user_models: List[dict]) -> List[float]:
    """
    Weighted average of user model weights by number of training samples.

    Args:
        user_models: list of dicts with keys: weights (list), samples (int)

    Returns:
        aggregated global weights [w0..w4]
    """
    total = sum(m['samples'] for m in user_models)
    if total == 0:
        return [HP['DEFAULT_BETA'], 0.0, 0.0, 0.0, 0.0]

    agg = [0.0] * 5
    for m in user_models:
        w = m['samples'] / total
        for i in range(5):
            agg[i] += w * m['weights'][i]
    return agg


# ═════════════════════════════════════════════════════════════════════════════
# RUN ONE FL ROUND
# Matches runFLRound() in flService.js exactly
# ═════════════════════════════════════════════════════════════════════════════
def run_fl_round() -> dict:
    """
    Execute one complete federated learning round:
      1. Load global model from DB
      2. For each user: load their pSS data, train locally, save weights
      3. FedAvg aggregate → update global model in DB
      4. Save round history

    Returns:
        dict with round stats or {'error': message}
    """
    conn   = get_db()
    cursor = conn.cursor(dictionary=True)

    # Load global model
    cursor.execute('SELECT * FROM fl_global_model WHERE id=1')
    global_model  = cursor.fetchone()
    current_round = (global_model['round'] if global_model else 0) + 1
    current_lr    = HP['LEARNING_RATE'] * (HP['LR_DECAY'] ** (current_round - 1))

    global_weights = [
        global_model['w0'] if global_model else HP['DEFAULT_BETA'],
        global_model['w1'] if global_model else 0.0,
        global_model['w2'] if global_model else 0.0,
        global_model['w3'] if global_model else 0.0,
        global_model['w4'] if global_model else 0.0,
    ]
    prev_global_loss = global_model['avg_loss'] if global_model and 'avg_loss' in global_model else 999.0

    print(f'\n[FL] Round {current_round} | LR={current_lr:.5f} | beta0={global_weights[0]:.4f}')

    # Load users
    cursor.execute('SELECT user_id, username FROM users')
    users = cursor.fetchall()

    # Max crime count for normalisation
    cursor.execute('SELECT MAX(crime_count) as max_count FROM safety_scores')
    row       = cursor.fetchone()
    max_count = row['max_count'] if row and row['max_count'] else 500

    if len(users) < HP['MIN_PARTICIPANTS']:
        conn.close()
        return {'error': 'Not enough users.'}

    user_models = []

    for user in users:
        uid = user['user_id']

        # Load user pSS training data (negative pSS = unsafe events)
        cursor.execute("""
            SELECT up.grid_x, up.grid_y, up.pss,
                   COALESCE(ss.crime_count, 0) AS crime_count,
                   HOUR(up.last_updated)        AS hour,
                   DAYOFWEEK(up.last_updated)   AS dayOfWeek,
                   (SELECT COUNT(*) FROM user_pss up2
                    WHERE up2.user_id = up.user_id
                      AND ABS(up2.grid_x - up.grid_x) <= 2
                      AND ABS(up2.grid_y - up.grid_y) <= 2) AS nearby_count
            FROM user_pss up
            LEFT JOIN safety_scores ss
                ON ss.grid_x = up.grid_x AND ss.grid_y = up.grid_y
            WHERE up.user_id = %s AND up.pss < 0
            LIMIT 300
        """, (uid,))
        pss_data = cursor.fetchall()

        if not pss_data:
            continue

        training_data = [
            {**row, 'max_count': max_count, 'gaussian_weight': 1.0}
            for row in pss_data
        ]

        # Load existing local weights or use global
        cursor.execute(
            'SELECT w0,w1,w2,w3,w4 FROM user_fl_weights WHERE user_id=%s', (uid,)
        )
        local_row   = cursor.fetchone()
        init_weights = (
            [local_row['w0'], local_row['w1'], local_row['w2'],
             local_row['w3'], local_row['w4']]
            if local_row else global_weights[:]
        )

        trained = train_local_model(init_weights, training_data, current_lr)

        print(f'[FL]   {user["username"]:12s} samples={len(training_data):3d} '
              f'epochs={trained["epochs_run"]:3d} loss={trained["final_loss"]:.4f} '
              f'beta0={trained["weights"][0]:.4f}')

        # Save user weights back to DB
        w = trained['weights']
        cursor.execute("""
            INSERT INTO user_fl_weights
                (user_id, w0, w1, w2, w3, w4, loss, round)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                w0=%s, w1=%s, w2=%s, w3=%s, w4=%s, loss=%s, round=%s
        """, (uid, w[0], w[1], w[2], w[3], w[4], trained['final_loss'], current_round,
                   w[0], w[1], w[2], w[3], w[4], trained['final_loss'], current_round))
        conn.commit()

        user_models.append({
            'user_id':   uid,
            'weights':   trained['weights'],
            'samples':   len(training_data),
            'loss':      trained['final_loss'],
            'epochs_run': trained['epochs_run'],
        })

    if len(user_models) < HP['MIN_PARTICIPANTS']:
        conn.close()
        return {'error': 'Not enough trained users.'}

    # FedAvg aggregate
    new_global = fed_avg_aggregate(user_models)
    avg_loss   = sum(m['loss'] for m in user_models) / len(user_models)
    avg_epochs = round(sum(m['epochs_run'] for m in user_models) / len(user_models))
    converged  = abs(prev_global_loss - avg_loss) < HP['CONVERGENCE_DELTA']

    print(f'[FL] FedAvg: beta0={new_global[0]:.4f} avgLoss={avg_loss:.4f} converged={converged}')

    # Update global model in DB
    cursor.execute("""
        UPDATE fl_global_model
        SET w0=%s, w1=%s, w2=%s, w3=%s, w4=%s,
            round=%s, participants=%s, updated_at=NOW()
        WHERE id=1
    """, (*new_global, current_round, len(user_models)))

    # Save round history
    cursor.execute("""
        INSERT INTO fl_rounds
            (round, participants, avg_loss, global_w0, global_w1, global_w2, global_w3, global_w4)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE participants=%s, avg_loss=%s
    """, (current_round, len(user_models), avg_loss, *new_global,
          len(user_models), avg_loss))
    conn.commit()
    conn.close()

    return {
        'round':          current_round,
        'participants':   len(user_models),
        'avg_loss':       round(avg_loss, 6),
        'avg_epochs':     avg_epochs,
        'global_weights': new_global,
        'converged':      converged,
        'learning_rate':  current_lr,
    }


# ═════════════════════════════════════════════════════════════════════════════
# TRAIN UNTIL CONVERGENCE
# Matches trainUntilConvergence() in flService.js exactly
# ═════════════════════════════════════════════════════════════════════════════
def train_until_convergence(max_rounds: int = 20) -> dict:
    """
    Run FL rounds until convergence or max_rounds reached.

    Returns:
        dict with rounds, final_loss, final_beta, converged, history
    """
    print(f'[FL] Auto-training for up to {max_rounds} rounds...')
    history   = []
    prev_loss = float('inf')

    for i in range(max_rounds):
        result = run_fl_round()
        if 'error' in result:
            print(f'[FL] Stopped: {result["error"]}')
            break

        history.append({
            'round':  result['round'],
            'loss':   result['avg_loss'],
            'beta0':  result['global_weights'][0],
            'epochs': result['avg_epochs'],
        })

        improvement = prev_loss - result['avg_loss']
        if result['converged'] or improvement < HP['CONVERGENCE_DELTA']:
            print(f'[FL] Converged at round {result["round"]}')
            return {
                'rounds':      result['round'],
                'final_loss':  result['avg_loss'],
                'final_beta':  result['global_weights'][0],
                'converged':   True,
                'history':     history,
            }

        prev_loss = result['avg_loss']

    last = history[-1] if history else {}
    return {
        'rounds':     len(history),
        'final_loss': last.get('loss'),
        'final_beta': last.get('beta0'),
        'converged':  False,
        'history':    history,
    }


# ═════════════════════════════════════════════════════════════════════════════
# GET PERSONALISED BETA FOR A USER
# Matches getPersonalizedBeta() in flService.js exactly
# ═════════════════════════════════════════════════════════════════════════════
def get_personalized_beta(user_id: Optional[str], context: dict) -> float:
    """
    Get the personalised β for a user given current context.
    Falls back to global model, then to DEFAULT_BETA.

    Args:
        user_id : user UUID string (or None for global)
        context : dict with keys: crime_count, hour, dayOfWeek, nearby_count

    Returns:
        float β value (always negative)
    """
    try:
        conn   = get_db()
        cursor = conn.cursor(dictionary=True)
        weights = None

        if user_id:
            cursor.execute(
                'SELECT w0,w1,w2,w3,w4 FROM user_fl_weights WHERE user_id=%s',
                (user_id,)
            )
            row = cursor.fetchone()
            if row:
                weights = [row['w0'], row['w1'], row['w2'], row['w3'], row['w4']]

        if not weights:
            cursor.execute('SELECT w0,w1,w2,w3,w4 FROM fl_global_model WHERE id=1')
            row = cursor.fetchone()
            if row:
                weights = [row['w0'], row['w1'], row['w2'], row['w3'], row['w4']]

        conn.close()

        if not weights:
            return HP['DEFAULT_BETA']

        return predict_beta(weights, extract_features(context))

    except Exception as e:
        print(f'[FL] getPersonalizedBeta error: {e}')
        return HP['DEFAULT_BETA']


# ═════════════════════════════════════════════════════════════════════════════
# EXPORT WEIGHTS TO JSON
# Call this to export trained weights from DB to a JSON file
# ═════════════════════════════════════════════════════════════════════════════
def export_weights_to_json(output_path: str = 'fl_weights.json'):
    """
    Export all trained weights from MySQL to a JSON file.
    Useful for importing into other Python scripts without DB connection.
    """
    conn   = get_db()
    cursor = conn.cursor(dictionary=True)

    cursor.execute('SELECT * FROM fl_global_model WHERE id=1')
    global_model = cursor.fetchone()

    cursor.execute("""
        SELECT u.username, u.user_id, f.w0, f.w1, f.w2, f.w3, f.w4, f.loss, f.round
        FROM user_fl_weights f
        JOIN users u ON u.user_id = f.user_id
        ORDER BY f.loss ASC
    """)
    user_models = cursor.fetchall()

    cursor.execute('SELECT * FROM fl_rounds ORDER BY round ASC')
    rounds = cursor.fetchall()

    conn.close()

    export = {
        'exported_at':  datetime.now().isoformat(),
        'global_model': global_model,
        'user_models':  user_models,
        'round_history': rounds,
        'hyperparameters': HP,
    }

    # Convert datetime objects to string for JSON serialisation
    def convert(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return str(obj)

    with open(output_path, 'w') as f:
        json.dump(export, f, indent=2, default=convert)

    print(f'[FL] Weights exported to {output_path}')
    return export


# ═════════════════════════════════════════════════════════════════════════════
# SAVE / LOAD MODEL (pickle) — for offline use without DB
# ═════════════════════════════════════════════════════════════════════════════
def save_model(path: str = 'fl_model.pkl'):
    """Save global weights to pickle file for offline import."""
    conn   = get_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute('SELECT * FROM fl_global_model WHERE id=1')
    model = cursor.fetchone()
    conn.close()
    with open(path, 'wb') as f:
        pickle.dump({'weights': [model['w0'], model['w1'], model['w2'],
                                  model['w3'], model['w4']],
                     'round':   model['round'],
                     'HP':      HP}, f)
    print(f'[FL] Model saved to {path}')


def load_model(path: str = 'fl_model.pkl') -> dict:
    """Load model from pickle file."""
    with open(path, 'rb') as f:
        return pickle.load(f)


# ═════════════════════════════════════════════════════════════════════════════
# ONE-LINE IMPORT FUNCTION
# from fl_model import predict_safety_score
# ═════════════════════════════════════════════════════════════════════════════
def predict_safety_score(
    crime_count:  float = 0,
    hour:         int   = 12,
    is_weekend:   int   = 0,
    nearby_count: float = 0,
    user_id:      Optional[str] = None,
    model_path:   Optional[str] = None,
) -> float:
    """
    One-line convenience function to get a predicted safety β score.

    Can work in two modes:
      1. DB mode (default): reads weights from MySQL
      2. Offline mode: pass model_path='fl_model.pkl' to use saved file

    Args:
        crime_count  : number of crimes in this cell
        hour         : hour of day (0-23)
        is_weekend   : 1 if weekend, 0 if weekday
        nearby_count : number of nearby unsafe cells
        user_id      : optional user UUID for personalised β
        model_path   : optional path to .pkl file (offline mode)

    Returns:
        float β value (always negative, range [-10, -0.5])

    Example:
        from fl_model import predict_safety_score
        beta = predict_safety_score(crime_count=5, hour=22, is_weekend=0)
        print(beta)  # e.g. -6.88
    """
    context = {
        'crime_count':  crime_count,
        'hour':         hour,
        'dayOfWeek':    7 if is_weekend else 2,  # Saturday=7, Monday=2 in MySQL
        'nearby_count': nearby_count,
        'max_count':    500,
    }

    # Offline mode — load from pickle
    if model_path and os.path.exists(model_path):
        model   = load_model(model_path)
        weights = model['weights']
        return predict_beta(weights, extract_features(context))

    # DB mode
    return get_personalized_beta(user_id, context)


# ═════════════════════════════════════════════════════════════════════════════
# MAIN — run from command line
# ═════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'

    if cmd == 'train':
        # python fl_model.py train
        result = train_until_convergence(max_rounds=20)
        print(f'\n[FL] Done: rounds={result["rounds"]} '
              f'loss={result["final_loss"]:.4f} '
              f'beta={result["final_beta"]:.4f} '
              f'converged={result["converged"]}')

    elif cmd == 'round':
        # python fl_model.py round
        result = run_fl_round()
        print(f'\n[FL] Round result: {json.dumps(result, indent=2)}')

    elif cmd == 'export':
        # python fl_model.py export
        export_weights_to_json('fl_weights.json')
        save_model('fl_model.pkl')

    elif cmd == 'predict':
        # python fl_model.py predict
        beta = predict_safety_score(crime_count=5, hour=22, is_weekend=0, nearby_count=3)
        print(f'[FL] Predicted beta: {beta:.4f}')

    else:
        print('Usage: python fl_model.py [train|round|export|predict]')
