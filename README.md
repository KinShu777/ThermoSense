# Urban Heat Mitigation AI

A Random Forest model that classifies a location's urban-heat-island
severity (1–5) from three satellite-derived inputs — Land Surface
Temperature (LST), vegetation index (NDVI), and land-use/land-cover
(LULC) — and suggests mitigation strategies. Packaged as a runnable
web application.

## What's in here

```
uhi_app/
├── uhi_model.py        # Reusable model class (train, predict, save/load)
├── train.py            # One-time training script -> saves models/uhi_model.pkl
├── app.py              # Flask web app + JSON API, loads the saved model
├── requirements.txt
├── models/
│   └── uhi_model.pkl    # Trained model artifact (created by train.py)
├── templates/
│   └── index.html       # Dashboard UI
└── static/
    ├── style.css
    └── app.js
```

## Setup

```bash
cd uhi_app
pip install -r requirements.txt
```

## Train the model (first time only)

```bash
python train.py
```

This trains the Random Forest on 5,000 synthetic samples, prints an
evaluation report, and saves the trained model to `models/uhi_model.pkl`.
You only need to re-run this if you change the model code, the training
data, or want to retrain with real satellite data instead of synthetic data.

## Run the app

```bash
python app.py
```

Open **http://localhost:5000** in your browser. If `models/uhi_model.pkl`
doesn't exist yet, `app.py` will train it automatically on first launch.

### Using the dashboard

1. **Site Readings** — set LST, NDVI, and LULC for a location (sliders or
   type exact values) and click **Classify Heat Zone**. You'll get the
   predicted heat-zone label, the model's confidence, a probability
   breakdown across all 5 zones, and mitigation suggestions tailored to
   that site.
2. **Mitigation Sandbox** — tick one or more interventions (tree planting,
   cool roofs, cool pavements) and click **Simulate Impact** to see the
   projected temperature drop from the current LST value.

## Using it as a plain Python library (no web app)

```python
from uhi_model import UrbanHeatMitigationAI
import pandas as pd

ai = UrbanHeatMitigationAI.load("models/uhi_model.pkl")

new_sites = pd.DataFrame({
    "LST":  [46.0, 32.0, 41.0],
    "NDVI": [0.10, 0.70, 0.30],
    "LULC": [6, 2, 4],
})

result = ai.predict_with_confidence(new_sites)
print(result[["LST", "NDVI", "LULC", "predicted_label", "confidence"]])
```

## API reference

| Endpoint            | Method | Body                                              | Returns                                              |
|----------------------|--------|----------------------------------------------------|-------------------------------------------------------|
| `/api/predict`       | POST   | `{"lst": 44.5, "ndvi": 0.15, "lulc": 6}`            | predicted zone, confidence, per-class probabilities, mitigation suggestions |
| `/api/impact`        | POST   | `{"current_temp": 44.5, "changes": ["plant_trees"]}`| predicted temperature change and new temperature      |
| `/api/model-info`    | GET    | —                                                  | feature importances, training metrics, label mappings |

`changes` accepted values: `"plant_trees"`, `"cool_roofs"`, `"cool_pavements"`.

`lulc` codes: 1 Water Bodies, 2 Trees, 3 Grassland, 4 Cropland, 5 Shrub,
6 Built-up Area, 7 Bare Ground.

## Using real satellite data instead of synthetic data

`UrbanHeatMitigationAI.train()` accepts any DataFrame with columns
`LST`, `NDVI`, `LULC`, `HeatZone`:

```python
import pandas as pd
from uhi_model import UrbanHeatMitigationAI

real_data = pd.read_csv("my_satellite_extract.csv")  # columns: LST, NDVI, LULC, HeatZone
ai = UrbanHeatMitigationAI()
ai.train(data=real_data)
ai.save("models/uhi_model.pkl")
```

Then restart `app.py` (or delete the old `.pkl` first) to serve the
newly trained model.

## Notes on what changed from the original script

- Fixed a bug where `predict_heat_zones` checked a non-existent
  `model.is_fitted_` attribute (would always raise); replaced with a
  proper `_is_fitted` flag set after training or loading.
- Added `save()` / `load()` so the model is trained once and reused,
  instead of retraining from scratch on every run.
- Added `predict_with_confidence()`, which returns class probabilities
  alongside the predicted zone (used by the dashboard's confidence bars).
- Random data generation now uses a local `np.random.RandomState`
  instead of mutating global NumPy random state.
- Wrapped everything in a Flask app + dashboard UI for interactive use.
