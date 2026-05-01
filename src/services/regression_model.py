"""
regression_model.py
===================
Simple Linear Regression model to predict Safety Score (SS)
of a grid cell from its features.

Model:
    SS = w0 + w1*crime_count + w2*visitor_count + w3*crime_density

Features from safety_scores + user_ks tables:
    crime_count   : number of crimes in this grid cell
    visitor_count : number of users who have visited this cell (KS=1)
    crime_density : crime_count / (visitor_count + 1)  -- avoid div by zero

Target:
    safety_score  : float value (e.g. 0.2562, 0.3934 ...)

Algorithm:
    Gradient Descent with MSE loss
    No external ML libraries needed — pure Python + math

Usage:
    from regression_model import predict_ss, train_regression, evaluate

Place this file in:
    safe-route-backend/src/services/regression_model.py
"""

import math
import random
import json
import os
import mysql.connector
from typing import List, Tuple, Optional

# ─── DB config (same as fl_model.py) ─────────────────────────────────────────
DB_CONFIG = {
    'host':     'localhost',
    'user':     'root',
    'password': 'henry@258',
    'database': 'safe_route',
}

def get_db():
    return mysql.connector.connect(**DB_CONFIG)

# ─── Hyperparameters ──────────────────────────────────────────────────────────
HP = {
    'LEARNING_RATE': 0.01,
    'EPOCHS':        500,
    'EARLY_STOP':    10,
    'EARLY_DELTA':   0.0001,
}

# ═════════════════════════════════════════════════════════════════════════════
# LOAD DATA FROM MySQL
# ═════════════════════════════════════════════════════════════════════════════
def load_data() -> List[dict]:
    """
    Load safety scores and visitor counts from MySQL.
    Returns list of dicts with keys:
        grid_x, grid_y, safety_score, crime_count, visitor_count
    """
    conn   = get_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            ss.grid_x,
            ss.grid_y,
            ss.safety_score,
            ss.crime_count,
            COUNT(uk.user_id) AS visitor_count
        FROM safety_scores ss
        LEFT JOIN user_ks uk
            ON uk.grid_x = ss.grid_x
            AND uk.grid_y = ss.grid_y
        GROUP BY ss.grid_x, ss.grid_y, ss.safety_score, ss.crime_count
    """)
    rows = cursor.fetchall()
    conn.close()
    print(f'[REG] Loaded {len(rows)} grid cells from DB')
    return rows

# ═════════════════════════════════════════════════════════════════════════════
# FEATURE EXTRACTION
# ═════════════════════════════════════════════════════════════════════════════
def extract_features(row: dict, max_crimes: float, max_visitors: float) -> List[float]:
    """
    Extract 3 normalised features from a grid cell row.

    Features:
        [0] crime_count_norm   = crime_count / max_crimes
        [1] visitor_count_norm = visitor_count / max_visitors
        [2] crime_density      = crime_count / (visitor_count + 1)  normalised
    """
    crime   = row.get('crime_count',   0) or 0
    visitor = row.get('visitor_count', 0) or 0

    f0 = crime   / max_crimes   if max_crimes   > 0 else 0.0
    f1 = visitor / max_visitors if max_visitors > 0 else 0.0
    f2 = (crime / (visitor + 1)) / (max_crimes + 1)

    return [f0, f1, f2]

# ═════════════════════════════════════════════════════════════════════════════
# PREDICT
# ═════════════════════════════════════════════════════════════════════════════
def predict(weights: List[float], features: List[float]) -> float:
    """
    Linear model: SS = w0 + w1*f0 + w2*f1 + w3*f2
    """
    return (weights[0]
            + weights[1] * features[0]
            + weights[2] * features[1]
            + weights[3] * features[2])

# ═════════════════════════════════════════════════════════════════════════════
# TRAIN — Gradient Descent
# ═════════════════════════════════════════════════════════════════════════════
def train_regression(data: List[dict] = None) -> dict:
    """
    Train linear regression using gradient descent.

    Args:
        data: optional preloaded data. If None, loads from DB.

    Returns:
        dict with keys:
            weights, loss_history, epochs_run,
            final_loss, r_squared, max_crimes, max_visitors
    """
    if data is None:
        data = load_data()

    if len(data) < 2:
        print('[REG] Not enough data to train.')
        return {}

    # Compute normalisation constants
    max_crimes   = max((r.get('crime_count',   0) or 0) for r in data) or 1.0
    max_visitors = max((r.get('visitor_count', 0) or 0) for r in data) or 1.0

    # Build feature matrix and target vector
    X = [extract_features(r, max_crimes, max_visitors) for r in data]
    y = [float(r['safety_score']) for r in data]
    n = len(data)

    # Initialise weights to zero
    weights      = [0.0, 0.0, 0.0, 0.0]
    loss_history = []
    prev_loss    = float('inf')
    no_improv    = 0

    for epoch in range(HP['EPOCHS']):

        # Compute predictions and gradients
        grads     = [0.0] * 4
        epoch_loss = 0.0

        for i in range(n):
            pred  = predict(weights, X[i])
            error = pred - y[i]
            epoch_loss += error * error

            # MSE gradients
            grads[0] += 2 * error           # bias
            grads[1] += 2 * error * X[i][0] # crime_count
            grads[2] += 2 * error * X[i][1] # visitor_count
            grads[3] += 2 * error * X[i][2] # crime_density

        # Average gradients
        for j in range(4):
            grads[j] /= n
            weights[j] -= HP['LEARNING_RATE'] * grads[j]

        avg_loss = epoch_loss / n
        loss_history.append(round(avg_loss, 6))

        # Early stopping
        if prev_loss - avg_loss < HP['EARLY_DELTA']:
            no_improv += 1
            if no_improv >= HP['EARLY_STOP']:
                print(f'[REG] Early stop at epoch {epoch+1} | loss={avg_loss:.6f}')
                break
        else:
            no_improv = 0
        prev_loss = avg_loss

    # R² score
    y_mean  = sum(y) / n
    ss_tot  = sum((yi - y_mean) ** 2 for yi in y)
    ss_res  = sum((y[i] - predict(weights, X[i])) ** 2 for i in range(n))
    r2      = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    final_loss = loss_history[-1] if loss_history else 999.0
    print(f'[REG] Training done | epochs={len(loss_history)} '
          f'loss={final_loss:.6f} R²={r2:.4f}')
    print(f'[REG] Weights: w0={weights[0]:.4f} w1(crime)={weights[1]:.4f} '
          f'w2(visitor)={weights[2]:.4f} w3(density)={weights[3]:.4f}')

    return {
        'weights':      weights,
        'loss_history': loss_history,
        'epochs_run':   len(loss_history),
        'final_loss':   final_loss,
        'r_squared':    round(r2, 4),
        'max_crimes':   max_crimes,
        'max_visitors': max_visitors,
    }

# ═════════════════════════════════════════════════════════════════════════════
# EVALUATE — print predictions vs actual
# ═════════════════════════════════════════════════════════════════════════════
def evaluate(model: dict, data: List[dict] = None, top_n: int = 10):
    """
    Print predicted vs actual safety scores for top_n cells.

    Args:
        model : trained model dict from train_regression()
        data  : optional preloaded data. If None, loads from DB.
        top_n : number of rows to display
    """
    if data is None:
        data = load_data()

    weights      = model['weights']
    max_crimes   = model['max_crimes']
    max_visitors = model['max_visitors']

    print(f'\n{"Grid X":>8} {"Grid Y":>8} {"Actual SS":>10} {"Predicted SS":>13} {"Error":>8}')
    print('-' * 52)

    total_err = 0.0
    for row in data[:top_n]:
        features  = extract_features(row, max_crimes, max_visitors)
        predicted = predict(weights, features)
        actual    = float(row['safety_score'])
        error     = abs(predicted - actual)
        total_err += error
        print(f'{row["grid_x"]:>8} {row["grid_y"]:>8} '
              f'{actual:>10.4f} {predicted:>13.4f} {error:>8.4f}')

    print('-' * 52)
    print(f'{"MAE (Mean Absolute Error)":>40} {total_err/min(top_n,len(data)):>8.4f}')
    print(f'{"R² Score":>40} {model["r_squared"]:>8.4f}')

# ═════════════════════════════════════════════════════════════════════════════
# SAVE / LOAD MODEL
# ═════════════════════════════════════════════════════════════════════════════
def save_model(model: dict, path: str = 'regression_model.json'):
    """Save trained model weights to JSON file."""
    with open(path, 'w') as f:
        json.dump(model, f, indent=2)
    print(f'[REG] Model saved to {path}')

def load_model(path: str = 'regression_model.json') -> dict:
    """Load model from JSON file."""
    with open(path) as f:
        return json.load(f)

# ═════════════════════════════════════════════════════════════════════════════
# ONE-LINE PREDICT FUNCTION
# from regression_model import predict_ss
# ═════════════════════════════════════════════════════════════════════════════
def predict_ss(
    crime_count:   float,
    visitor_count: float,
    model_path:    str = 'regression_model.json'
) -> float:
    """
    Predict safety score for a grid cell.

    Args:
        crime_count   : number of crimes in the cell
        visitor_count : number of users who visited
        model_path    : path to saved model JSON

    Returns:
        predicted safety score (float)

    Example:
        from regression_model import predict_ss
        ss = predict_ss(crime_count=5, visitor_count=3)
        print(ss)  # e.g. 0.28
    """
    if not os.path.exists(model_path):
        print(f'[REG] Model not found at {model_path}. Training now...')
        model = train_regression()
        save_model(model, model_path)
    else:
        model = load_model(model_path)

    weights      = model['weights']
    max_crimes   = model['max_crimes']
    max_visitors = model['max_visitors']

    features = extract_features(
        {'crime_count': crime_count, 'visitor_count': visitor_count},
        max_crimes,
        max_visitors
    )
    return round(predict(weights, features), 4)


# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else 'train'

    if cmd == 'train':
        # python regression_model.py train
        model = train_regression()
        save_model(model, 'regression_model.json')
        evaluate(model)

    elif cmd == 'predict':
        # python regression_model.py predict
        ss = predict_ss(crime_count=5, visitor_count=3)
        print(f'[REG] Predicted SS: {ss}')

    elif cmd == 'evaluate':
        # python regression_model.py evaluate
        model = load_model('regression_model.json')
        data  = load_data()
        evaluate(model, data, top_n=20)

    else:
        print('Usage: python regression_model.py [train|predict|evaluate]')
