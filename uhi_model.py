"""
uhi_model.py
------------
Urban Heat Mitigation AI — core model class.

A reusable wrapper around a RandomForestClassifier that predicts urban
heat-zone severity (1-5) from satellite-derived features:
    - LST   : Land Surface Temperature (°C)
    - NDVI  : Normalized Difference Vegetation Index
    - LULC  : Land Use / Land Cover category (1-7)

This module is import-able on its own:

    from uhi_model import UrbanHeatMitigationAI
    ai = UrbanHeatMitigationAI()
    ai.train()
    ai.save("models/uhi_model.pkl")

    ai2 = UrbanHeatMitigationAI.load("models/uhi_model.pkl")
    ai2.predict_heat_zones(new_df)
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, f1_score


class UrbanHeatMitigationAI:
    def __init__(self, n_estimators=150, max_depth=12, random_state=42):
        self.model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_split=20,
            min_samples_leaf=10,
            class_weight="balanced",
            n_jobs=-1,
            random_state=random_state
        )
        self.feature_names = ['LST', 'NDVI', 'LULC']
        self.lulc_mapping = {
            1: 'Water Bodies',
            2: 'Trees',
            3: 'Grassland',
            4: 'Cropland',
            5: 'Shrub',
            6: 'Built-up Area',
            7: 'Bare Ground'
        }
        self.heat_zone_mapping = {
            1: 'Very Low (<36°C)',
            2: 'Low (36-39°C)',
            3: 'Moderate (39-42°C)',
            4: 'High (42-45°C)',
            5: 'Very High (>45°C)'
        }
        self._is_fitted = False
        self._feature_importances = None
        self._metrics = None

    # ------------------------------------------------------------------ #
    # Data generation (used only when no real dataset is supplied)
    # ------------------------------------------------------------------ #
    def _generate_synthetic_data(self, num_samples=1000):
        rng = np.random.RandomState(self.model.random_state)
        lst = rng.uniform(30, 50, num_samples)
        ndvi = rng.uniform(0.0, 0.8, num_samples)
        lulc = rng.randint(1, 8, num_samples)

        heat_zones = np.digitize(lst, bins=[36, 39, 42, 45]) + 1

        for i in range(num_samples):
            if ndvi[i] < 0.2 and heat_zones[i] < 3:
                heat_zones[i] = rng.randint(3, 6)
            if lulc[i] == 6 and heat_zones[i] < 4:
                heat_zones[i] = rng.randint(4, 6)
            if lulc[i] == 2 and heat_zones[i] > 3:
                heat_zones[i] = rng.randint(1, 4)

        heat_zones = np.clip(heat_zones, 1, 5)

        return pd.DataFrame({
            'LST': lst,
            'NDVI': ndvi,
            'LULC': lulc,
            'HeatZone': heat_zones
        })

    # ------------------------------------------------------------------ #
    # Training
    # ------------------------------------------------------------------ #
    def train(self, data=None, num_samples=1000, verbose=True):
        if data is None:
            if verbose:
                print("Generating synthetic data for training...")
            data = self._generate_synthetic_data(num_samples)

        X = data[self.feature_names]
        y = data['HeatZone']

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=self.model.random_state, stratify=y
        )

        if verbose:
            print("Training Random Forest Classifier...")
        self.model.fit(X_train, y_train)
        self._is_fitted = True

        y_pred = self.model.predict(X_test)
        present_labels = sorted(set(y_test) | set(y_pred))
        report = classification_report(
            y_test, y_pred,
            labels=present_labels,
            target_names=[self.heat_zone_mapping[i] for i in present_labels],
            output_dict=True
        )
        f1 = f1_score(y_test, y_pred, average='weighted')

        self._feature_importances = pd.Series(
            self.model.feature_importances_, index=self.feature_names
        ).sort_values(ascending=False)

        self._metrics = {
            "f1_weighted": float(f1),
            "report": report,
            "n_train": len(X_train),
            "n_test": len(X_test),
        }

        if verbose:
            print("\nModel Evaluation:")
            print(classification_report(
                y_test, y_pred, labels=present_labels,
                target_names=[self.heat_zone_mapping[i] for i in present_labels]
            ))
            print(f"F1 Score (weighted): {f1:.2f}")
            print("\nFeature Importances:")
            print(self._feature_importances)

        return data

    # ------------------------------------------------------------------ #
    # Prediction
    # ------------------------------------------------------------------ #
    def _check_fitted(self):
        if not self._is_fitted:
            raise RuntimeError("Model not trained. Call train() or load a saved model first.")

    def predict_heat_zones(self, new_data):
        """Predict heat zone (1-5) for each row of new_data."""
        self._check_fitted()
        return self.model.predict(new_data[self.feature_names])

    def predict_with_confidence(self, new_data):
        """
        Predict heat zone plus class probabilities for each row.
        Returns a DataFrame with columns: predicted_zone, predicted_label, confidence,
        plus one probability column per class.
        """
        self._check_fitted()
        X = new_data[self.feature_names]
        preds = self.model.predict(X)
        probs = self.model.predict_proba(X)
        classes = self.model.classes_

        out = new_data.copy()
        out['predicted_zone'] = preds
        out['predicted_label'] = [self.heat_zone_mapping[p] for p in preds]
        out['confidence'] = probs.max(axis=1)
        for idx, cls in enumerate(classes):
            out[f'prob_zone_{cls}'] = probs[:, idx]
        return out

    # ------------------------------------------------------------------ #
    # Hotspot analysis & mitigation suggestions
    # ------------------------------------------------------------------ #
    def analyze_hotspot_factors(self, hotspot_data):
        analysis_results = {}
        for feature in self.feature_names:
            if feature == 'LULC':
                lulc_counts = hotspot_data[feature].value_counts(normalize=True)
                analysis_results['Dominant LULC'] = int(lulc_counts.index[0])
                analysis_results['LULC Distribution'] = {
                    self.lulc_mapping[k]: f"{v:.2%}" for k, v in lulc_counts.items()
                }
            else:
                analysis_results[f'Average {feature}'] = float(hotspot_data[feature].mean())
                analysis_results[f'Min {feature}'] = float(hotspot_data[feature].min())
                analysis_results[f'Max {feature}'] = float(hotspot_data[feature].max())
        return analysis_results

    def suggest_mitigation_strategies(self, hotspot_analysis):
        suggestions = []
        if hotspot_analysis.get('Average NDVI', 0) < 0.3:
            suggestions.append("Plant more trees and create green spaces to increase vegetation cover.")
        if hotspot_analysis.get('Dominant LULC') == 6:
            suggestions.append("Install cool roofs and use reflective building materials.")
            suggestions.append("Explore vertical gardens on buildings.")
        if hotspot_analysis.get('Average LST', 0) > 40:
            suggestions.append("Implement cool pavement technologies for roads.")
            suggestions.append("Consider adding water bodies or permeable surfaces.")
        if not suggestions:
            suggestions.append("Further detailed analysis is needed to suggest specific mitigation strategies.")
        return suggestions

    def predict_impact(self, current_temp, proposed_changes, random_state=None):
        rng = np.random.RandomState(random_state)
        predicted_temp_change = 0
        if "plant_trees" in proposed_changes:
            predicted_temp_change -= rng.uniform(2, 3)
        if "cool_roofs" in proposed_changes:
            predicted_temp_change -= rng.uniform(1, 2)
        if "cool_pavements" in proposed_changes:
            predicted_temp_change -= rng.uniform(0.5, 1.5)

        new_temp = current_temp + predicted_temp_change
        return {
            "temp_change": float(predicted_temp_change),
            "new_temp": float(new_temp),
            "message": (
                f"With the proposed changes, the temperature is predicted to decrease by "
                f"{-predicted_temp_change:.1f}°C, resulting in a new average temperature of "
                f"{new_temp:.1f}°C."
            )
        }

    def simulate_mitigation_plan(self, current_lst, current_ndvi, current_lulc,
                                 tree_canopy_pct=0.0, cool_roofs_pct=0.0,
                                 cool_pavements_pct=0.0, water_features_pct=0.0):
        """
        Calculates realistic microclimatic cooling based on intervention intensity
        and evaluates multi-sector co-benefits:
          - Energy savings (AC cooling reduction)
          - Carbon offset & sequestration
          - Heat Vulnerability Index (HVI) reduction
          - Model-predicted new Heat Zone
        """
        self._check_fitted()

        # Scientific cooling models based on EPA UHI Compendium and LBNL Heat Island Group:
        # 1. Tree Canopy: shade + evapotranspiration (~1.0°C drop per 10% canopy increase, slight diminishing returns)
        tree_eff = (tree_canopy_pct / 10.0) * 0.95 * (1.0 - 0.004 * tree_canopy_pct)
        # 2. Cool Roofs: high albedo retrofit (~0.7°C drop per 20% roof conversion)
        roof_eff = (cool_roofs_pct / 20.0) * 0.70
        # 3. Cool Pavements: permeable / reflective pavement (~0.5°C drop per 20% pavement)
        pavement_eff = (cool_pavements_pct / 20.0) * 0.48
        # 4. Urban Water Features / Bio-swales: localized evaporative buffer
        water_eff = (water_features_pct / 10.0) * 0.60

        total_temp_drop = tree_eff + roof_eff + pavement_eff + water_eff
        projected_lst = max(24.0, round(current_lst - total_temp_drop, 2))

        # Vegetation (NDVI) improvement from canopy and bio-retention
        ndvi_boost = (tree_canopy_pct / 100.0) * 0.42 + (water_features_pct / 100.0) * 0.06
        projected_ndvi = min(0.90, max(0.0, round(current_ndvi + ndvi_boost, 3)))

        # Evaluate model prediction before and after
        before_df = pd.DataFrame({"LST": [current_lst], "NDVI": [current_ndvi], "LULC": [current_lulc]})
        after_df = pd.DataFrame({"LST": [projected_lst], "NDVI": [projected_ndvi], "LULC": [current_lulc]})

        before_res = self.predict_with_confidence(before_df).iloc[0]
        after_res = self.predict_with_confidence(after_df).iloc[0]

        # Co-Benefits Calculations
        # 1. Energy cooling demand reduction (~2.1% peak AC demand drop per 1°C reduction)
        energy_demand_cut_pct = min(36.0, round(total_temp_drop * 2.15, 1))
        kwh_saved_annual = int(energy_demand_cut_pct * 14200)  # estimated per km² urban zone
        cost_savings_usd = int(kwh_saved_annual * 0.145)

        # 2. Carbon benefits: direct sequestration + avoided power generation
        carbon_seq_tons = round((tree_canopy_pct / 10.0) * 22.4, 1)
        carbon_avoided_tons = round(kwh_saved_annual * 0.00041, 1)
        total_carbon_tons = round(carbon_seq_tons + carbon_avoided_tons, 1)

        # 3. Heat Vulnerability Index (HVI) score 0 - 100
        base_hvi = min(100, max(5, int((current_lst - 30.0) * 4.4 - current_ndvi * 28.0 + (18 if current_lulc == 6 else 4))))
        projected_hvi = min(100, max(5, int(base_hvi - total_temp_drop * 8.2)))

        def hvi_label(score):
            if score >= 80: return "Critical Extreme"
            if score >= 60: return "High Heat Stress"
            if score >= 35: return "Moderate"
            return "Low / Safe"

        return {
            "baseline": {
                "lst": current_lst,
                "ndvi": current_ndvi,
                "lulc": current_lulc,
                "zone": int(before_res["predicted_zone"]),
                "zone_label": before_res["predicted_label"],
                "confidence": float(before_res["confidence"]),
                "hvi": base_hvi,
                "hvi_status": hvi_label(base_hvi)
            },
            "projected": {
                "lst": projected_lst,
                "ndvi": projected_ndvi,
                "lulc": current_lulc,
                "zone": int(after_res["predicted_zone"]),
                "zone_label": after_res["predicted_label"],
                "confidence": float(after_res["confidence"]),
                "hvi": projected_hvi,
                "hvi_status": hvi_label(projected_hvi)
            },
            "impact": {
                "temp_change": round(-total_temp_drop, 2),
                "ndvi_change": round(projected_ndvi - current_ndvi, 3),
                "zone_shift": int(before_res["predicted_zone"]) - int(after_res["predicted_zone"]),
                "hvi_reduction": base_hvi - projected_hvi,
                "breakdown": {
                    "tree_cooling": round(-tree_eff, 2),
                    "roof_cooling": round(-roof_eff, 2),
                    "pavement_cooling": round(-pavement_eff, 2),
                    "water_cooling": round(-water_eff, 2),
                }
            },
            "cobenefits": {
                "cooling_demand_reduction_pct": energy_demand_cut_pct,
                "kwh_saved_annual": kwh_saved_annual,
                "cost_savings_usd": cost_savings_usd,
                "carbon_offset_tons": total_carbon_tons,
                "carbon_seq_tons": carbon_seq_tons,
                "carbon_avoided_tons": carbon_avoided_tons,
            }
        }

    # ------------------------------------------------------------------ #
    # Persistence
    # ------------------------------------------------------------------ #
    def save(self, path):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        joblib.dump(self, path)
        print(f"Model saved to {path}")

    @staticmethod
    def load(path):
        obj = joblib.load(path)
        if not isinstance(obj, UrbanHeatMitigationAI):
            raise TypeError("Loaded object is not a UrbanHeatMitigationAI instance.")
        return obj

