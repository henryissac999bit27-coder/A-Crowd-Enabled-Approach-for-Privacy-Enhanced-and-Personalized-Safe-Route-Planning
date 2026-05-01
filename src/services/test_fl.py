import sys
sys.path.append('src/services')

from fl_model import predict_safety_score, train_until_convergence, export_weights_to_json

# Quick prediction
beta = predict_safety_score(crime_count=5, hour=22, is_weekend=0)
print(f'Beta: {beta}')

# Full training
result = train_until_convergence(max_rounds=20)
print(f'Converged: {result["converged"]} at round {result["rounds"]}')
print(f'Final beta: {result["final_beta"]:.4f}')

# Export weights
export_weights_to_json('fl_weights.json')