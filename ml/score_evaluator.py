#!/usr/bin/env python3
"""
Trinetra — ML Score Evaluator (ml/score_evaluator.py)
Evaluates subscribers against trained Isolation Forest and Random Forest models.
Provides ML anomaly scores (0-100), top contributing anomalous factors, and updates SQLite DB.
"""

import os
import sys
import json
import joblib
import sqlite3
import argparse
import pandas as pd
import numpy as np

from features import extract_features, FEATURE_COLUMNS

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "trinetra.db")

def load_models():
    scaler_path = os.path.join(MODEL_DIR, "scaler.joblib")
    iso_path = os.path.join(MODEL_DIR, "isolation_forest.joblib")
    rf_path = os.path.join(MODEL_DIR, "random_forest.joblib")
    meta_path = os.path.join(MODEL_DIR, "model_metadata.json")

    if not (os.path.exists(scaler_path) and os.path.exists(iso_path) and os.path.exists(rf_path) and os.path.exists(meta_path)):
        return None, None, None, None

    scaler = joblib.load(scaler_path)
    iso_forest = joblib.load(iso_path)
    rf_clf = joblib.load(rf_path)

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    return scaler, iso_forest, rf_clf, meta

def evaluate_subscribers(subscriber_id=None, db_path=DEFAULT_DB_PATH, write_db=True):
    scaler, iso_forest, rf_clf, meta = load_models()

    if scaler is None:
        print("[-] Trained ML model artifacts not found. Run `python ml/train.py` first.")
        return {}

    df, labels = extract_features(db_path)
    if df.empty:
        return {}

    if subscriber_id:
        df = df[df["subscriber_id"] == subscriber_id].copy()
        if df.empty:
            print(f"[-] Subscriber {subscriber_id} not found.")
            return {}

    X = df[FEATURE_COLUMNS].copy()
    X_scaled = scaler.transform(X)

    # 1. Isolation Forest Anomaly Score
    raw_iso = iso_forest.score_samples(X_scaled)
    iso_min = meta["score_bounds"]["iso_min"]
    iso_max = meta["score_bounds"]["iso_max"]
    if iso_max > iso_min:
        iso_scores = ((iso_max - raw_iso) / (iso_max - iso_min)) * 100.0
    else:
        iso_scores = np.zeros_like(raw_iso)

    # 2. Random Forest Fraud Probability Score
    rf_probs = rf_clf.predict_proba(X_scaled)[:, 1] * 100.0 if 1 in rf_clf.classes_ else np.zeros(len(df))

    # 3. Combined ML Score: 50% IsoForest Anomaly + 50% Supervised RF
    combined_ml_scores = np.clip(0.5 * iso_scores + 0.5 * rf_probs, 0.0, 100.0)

    # 4. Top 3 Feature Contributions for Explainability
    feat_importances = meta.get("feature_importances", {})

    results = {}
    conn = sqlite3.connect(db_path) if write_db else None
    cursor = conn.cursor() if conn else None

    for i, (_, row) in enumerate(df.iterrows()):
        sid = row["subscriber_id"]
        score = round(float(combined_ml_scores[i]), 1)
        iso_s = round(float(iso_scores[i]), 1)
        rf_s = round(float(rf_probs[i]), 1)

        # Identify top anomalous factors for this subscriber
        # Multiply scaled feature value by model feature importance
        factors = []
        for feat in FEATURE_COLUMNS:
            val = float(row[feat])
            imp = float(feat_importances.get(feat, 0.0))
            z_score = abs(float(X_scaled[i][FEATURE_COLUMNS.index(feat)]))
            contribution = z_score * imp
            factors.append((feat, val, contribution))

        factors.sort(key=lambda x: x[2], reverse=True)
        top_factors = [
            {"feature": f[0], "value": round(f[1], 2), "impact_score": round(f[2], 3)}
            for f in factors[:3]
        ]

        res = {
            "subscriber_id": sid,
            "ml_score": score,
            "isolation_forest_score": iso_s,
            "random_forest_score": rf_s,
            "top_anomalous_factors": top_factors
        }
        results[sid] = res

        if cursor:
            # Update existing risk assessment record or store ML score
            cursor.execute("""
                UPDATE risk_assessments
                SET ml_score = ?
                WHERE entity_id = ? AND entity_type = 'subscriber';
            """, (score, sid))

    if conn:
        conn.commit()
        conn.close()

    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate ML Risk Scores for Subscribers")
    parser.add_argument("--subscriber", type=str, help="Single subscriber ID to evaluate")
    parser.add_argument("--db", type=str, default=DEFAULT_DB_PATH, help="Path to SQLite database")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--no-write", action="store_true", help="Do not write results to SQLite DB")

    args = parser.parse_args()
    res = evaluate_subscribers(
        subscriber_id=args.subscriber,
        db_path=args.db,
        write_db=not args.no_write
    )

    if args.json:
        print(json.dumps(res, indent=2))
    else:
        print(f"[+] Evaluated ML Scores for {len(res)} subscribers.")
        # Print sample
        for sid, data in list(res.items())[:5]:
            top_f = ", ".join([f"{f['feature']}={f['value']}" for f in data['top_anomalous_factors']])
            print(f"    - {sid}: ML Score={data['ml_score']} (Iso: {data['isolation_forest_score']}, RF: {data['random_forest_score']}) | Top Factors: {top_f}")
