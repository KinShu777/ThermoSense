"""
app.py
------
Flask web application for the Urban Heat Mitigation AI model.

Run:
    python app.py

Then open http://localhost:5000 in a browser.

API:
    POST /api/predict
        body: {"lst": 44.5, "ndvi": 0.15, "lulc": 6}
        returns: prediction + confidence + hotspot analysis + mitigation suggestions

    POST /api/impact
        body: {"current_temp": 44.5, "changes": ["plant_trees", "cool_roofs"]}
        returns: predicted temperature impact

    GET /api/model-info
        returns: feature importances and training metrics
"""

import os
import pandas as pd
from flask import Flask, request, jsonify, render_template

from uhi_model import UrbanHeatMitigationAI

APP_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(APP_DIR, "models", "uhi_model.pkl")

app = Flask(__name__)

# Load the trained model once at startup. If it doesn't exist yet, train it.
if os.path.exists(MODEL_PATH):
    ai = UrbanHeatMitigationAI.load(MODEL_PATH)
else:
    ai = UrbanHeatMitigationAI()
    ai.train(num_samples=5000)
    ai.save(MODEL_PATH)


@app.route("/")
def index():
    return render_template(
        "index.html",
        lulc_mapping=ai.lulc_mapping,
        heat_zone_mapping=ai.heat_zone_mapping,
    )


@app.route("/api/predict", methods=["POST"])
def predict():
    payload = request.get_json(force=True)
    try:
        lst = float(payload["lst"])
        ndvi = float(payload["ndvi"])
        lulc = int(payload["lulc"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Provide numeric 'lst', 'ndvi', and integer 'lulc' (1-7)."}), 400

    if lulc not in ai.lulc_mapping:
        return jsonify({"error": f"'lulc' must be one of {list(ai.lulc_mapping.keys())}."}), 400

    row = pd.DataFrame({"LST": [lst], "NDVI": [ndvi], "LULC": [lulc]})
    result = ai.predict_with_confidence(row).iloc[0]

    prob_cols = {c: float(result[c]) for c in result.index if c.startswith("prob_zone_")}

    analysis = ai.analyze_hotspot_factors(row)
    suggestions = ai.suggest_mitigation_strategies(analysis)

    return jsonify({
        "input": {"lst": lst, "ndvi": ndvi, "lulc": lulc, "lulc_label": ai.lulc_mapping[lulc]},
        "predicted_zone": int(result["predicted_zone"]),
        "predicted_label": result["predicted_label"],
        "confidence": float(result["confidence"]),
        "class_probabilities": prob_cols,
        "mitigation_suggestions": suggestions,
    })


@app.route("/api/impact", methods=["POST"])
def impact():
    payload = request.get_json(force=True)
    try:
        current_temp = float(payload["current_temp"])
        changes = payload.get("changes", [])
        if not isinstance(changes, list):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Provide numeric 'current_temp' and a list 'changes'."}), 400

    result = ai.predict_impact(current_temp, changes, random_state=42)
    return jsonify(result)


PRESETS = [
    {
        "id": "commercial",
        "name": "Commercial Downtown Core",
        "tag": "Severe UHI",
        "icon": "🏙️",
        "lst": 46.5,
        "ndvi": 0.08,
        "lulc": 6,
        "desc": "Dense high-rises, asphalt corridors, near-zero tree canopy. High daytime heat absorption & night heat trapping."
    },
    {
        "id": "industrial",
        "name": "Industrial & Logistics Hub",
        "tag": "Critical Hotspot",
        "icon": "🏭",
        "lst": 48.2,
        "ndvi": 0.04,
        "lulc": 6,
        "desc": "Expansive corrugated metal roofs, large open asphalt parking lots with extreme solar heat retention."
    },
    {
        "id": "dense_res",
        "name": "High-Density Residential",
        "tag": "Elevated Risk",
        "icon": "🏢",
        "lst": 42.8,
        "ndvi": 0.16,
        "lulc": 6,
        "desc": "Apartment clusters with narrow streets, limited parks, and vulnerable elderly/pedestrian populations."
    },
    {
        "id": "suburban",
        "name": "Suburban Neighborhood",
        "tag": "Moderate Buffer",
        "icon": "🏡",
        "lst": 37.6,
        "ndvi": 0.44,
        "lulc": 3,
        "desc": "Detached homes, lawns, and tree-lined streets with balanced vegetation maintaining thermal moderation."
    },
    {
        "id": "park",
        "name": "Urban Botanical Forest",
        "tag": "Cool Island Oasis",
        "icon": "🌳",
        "lst": 32.5,
        "ndvi": 0.72,
        "lulc": 2,
        "desc": "Dense continuous canopy and permeable soil providing natural evaporative cooling to surrounding blocks."
    },
    {
        "id": "waterfront",
        "name": "Waterfront Promenade",
        "tag": "Thermal Buffer",
        "icon": "🌊",
        "lst": 34.0,
        "ndvi": 0.32,
        "lulc": 1,
        "desc": "Water body thermal buffering and coastal breeze mitigating extreme surface heat spikes."
    }
]

SAMPLE_CITY_DISTRICTS = [
    {"id": "D-01", "name": "Central Financial District", "lst": 46.8, "ndvi": 0.07, "lulc": 6},
    {"id": "D-02", "name": "Northern Freight & Logistics", "lst": 48.5, "ndvi": 0.03, "lulc": 6},
    {"id": "D-03", "name": "Old Town Market & Bazaar", "lst": 45.2, "ndvi": 0.11, "lulc": 6},
    {"id": "D-04", "name": "Civic Hospital & University", "lst": 43.1, "ndvi": 0.19, "lulc": 6},
    {"id": "D-05", "name": "East High-Rise Residences", "lst": 41.7, "ndvi": 0.22, "lulc": 6},
    {"id": "D-06", "name": "Metro Transit & Depot", "lst": 44.6, "ndvi": 0.09, "lulc": 6},
    {"id": "D-07", "name": "Riverfront Marina Walk", "lst": 34.2, "ndvi": 0.35, "lulc": 1},
    {"id": "D-08", "name": "West Ridge Suburbs", "lst": 37.4, "ndvi": 0.45, "lulc": 3},
    {"id": "D-09", "name": "Metropolitan Botanical Park", "lst": 32.1, "ndvi": 0.74, "lulc": 2},
    {"id": "D-10", "name": "Southern Green Belt Farm", "lst": 35.8, "ndvi": 0.58, "lulc": 4},
]


@app.route("/api/presets", methods=["GET"])
def presets():
    return jsonify({"presets": PRESETS})


@app.route("/api/advanced-impact", methods=["POST"])
def advanced_impact():
    payload = request.get_json(force=True)
    try:
        lst = float(payload.get("lst", 41.0))
        ndvi = float(payload.get("ndvi", 0.30))
        lulc = int(payload.get("lulc", 6))
        changes = payload.get("changes", [])
        tree_canopy = float(payload.get("tree_canopy_pct", 25.0 if "plant_trees" in changes else 0.0))
        cool_roofs = float(payload.get("cool_roofs_pct", 50.0 if "cool_roofs" in changes else 0.0))
        cool_pavements = float(payload.get("cool_pavements_pct", 40.0 if "cool_pavements" in changes else 0.0))
        water_features = float(payload.get("water_features_pct", 15.0 if "water_features" in changes else 0.0))
    except (TypeError, ValueError) as err:
        return jsonify({"error": f"Invalid parameter format: {str(err)}"}), 400

    sim_result = ai.simulate_mitigation_plan(
        current_lst=lst,
        current_ndvi=ndvi,
        current_lulc=lulc,
        tree_canopy_pct=tree_canopy,
        cool_roofs_pct=cool_roofs,
        cool_pavements_pct=cool_pavements,
        water_features_pct=water_features
    )
    return jsonify(sim_result)


@app.route("/api/batch-sample", methods=["GET"])
def batch_sample():
    records = []
    for d in SAMPLE_CITY_DISTRICTS:
        row = pd.DataFrame({"LST": [d["lst"]], "NDVI": [d["ndvi"]], "LULC": [d["lulc"]]})
        res = ai.predict_with_confidence(row).iloc[0]
        analysis = ai.analyze_hotspot_factors(row)
        top_suggestion = ai.suggest_mitigation_strategies(analysis)[0]
        records.append({
            "id": d["id"],
            "name": d["name"],
            "lst": d["lst"],
            "ndvi": d["ndvi"],
            "lulc": d["lulc"],
            "lulc_label": ai.lulc_mapping.get(d["lulc"], "Unknown"),
            "predicted_zone": int(res["predicted_zone"]),
            "predicted_label": res["predicted_label"],
            "confidence": float(res["confidence"]),
            "primary_mitigation": top_suggestion
        })

    # Summary statistics
    total = len(records)
    zone5_count = sum(1 for r in records if r["predicted_zone"] == 5)
    zone4_count = sum(1 for r in records if r["predicted_zone"] == 4)
    avg_temp = round(sum(r["lst"] for r in records) / total, 1)

    return jsonify({
        "districts": records,
        "summary": {
            "total_districts": total,
            "critical_zone5_pct": round((zone5_count / total) * 100, 1),
            "elevated_zone4_5_pct": round(((zone4_count + zone5_count) / total) * 100, 1),
            "average_city_lst": avg_temp
        }
    })


@app.route("/api/model-info")
def model_info():
    fi = ai._feature_importances
    metrics = ai._metrics or {}
    return jsonify({
        "feature_importances": fi.to_dict() if fi is not None else {},
        "f1_weighted": metrics.get("f1_weighted"),
        "n_train": metrics.get("n_train"),
        "n_test": metrics.get("n_test"),
        "lulc_mapping": ai.lulc_mapping,
        "heat_zone_mapping": ai.heat_zone_mapping,
    })


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)

