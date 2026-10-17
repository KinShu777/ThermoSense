"""
train.py
--------
Run this once to train the Urban Heat Mitigation AI model and save it
to models/uhi_model.pkl. The Flask app (app.py) loads this saved model
instead of retraining every time it starts.

Usage:
    python train.py
"""

from uhi_model import UrbanHeatMitigationAI

if __name__ == "__main__":
    ai = UrbanHeatMitigationAI()
    data = ai.train(num_samples=5000)
    ai.save("models/uhi_model.pkl")

    # quick sanity check on a few example rows
    import pandas as pd
    sample = pd.DataFrame({
        'LST': [46.0, 32.0, 41.0],
        'NDVI': [0.1, 0.7, 0.3],
        'LULC': [6, 2, 4]
    })
    preds = ai.predict_with_confidence(sample)
    print("\nSanity check predictions:")
    print(preds[['LST', 'NDVI', 'LULC', 'predicted_label', 'confidence']])
