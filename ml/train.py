#!/usr/bin/env python3
"""
Trinetra — ML Model Training Pipeline (ml/train.py)
Trains Isolation Forest (unsupervised) and Random Forest (supervised) models on extracted telecom features.
Saves model artifacts and metadata to ml/models/.
"""

import os
import sys
import json
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
from sklearn.preprocessing import StandardScaler

from features import extract_features, FEATURE_COLUMNS

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")

def train_models(db_path=None):
    os.makedirs(MODEL_DIR, exist_ok=True)

    print("[*] Extracting feature vectors from database...")
    df, labels = extract_features(db_path) if db_path else extract_features()

    if df.empty:
        print("[-] No subscriber data found. Aborting training.")
        sys.exit(1)

    X = df[FEATURE_COLUMNS].copy()
    y = labels.values

    subscriber_ids = df["subscriber_id"].values

    # 1. Feature Scaler
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # 2. Unsupervised Model: Isolation Forest
    print("[*] Training Isolation Forest anomaly detection model...")
    iso_forest = IsolationForest(
        n_estimators=100,
        contamination=0.15, # ~15% expected anomalies
        random_state=42
    )
    iso_forest.fit(X_scaled)

    # Compute raw anomaly scores (lower means more anomalous)
    raw_scores = iso_forest.score_samples(X_scaled)
    # Min-max normalize to [0, 100] scale where 100 is most anomalous
    min_s, max_s = raw_scores.min(), raw_scores.max()
    if max_s > min_s:
        iso_scores = ((max_s - raw_scores) / (max_s - min_s)) * 100.0
    else:
        iso_scores = np.zeros_like(raw_scores)

    # 3. Supervised Model: Random Forest Classifier
    print("[*] Training Random Forest classification model...")
    rf_clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=6,
        random_state=42
    )
    rf_clf.fit(X_scaled, y)

    rf_probs = rf_clf.predict_proba(X_scaled)[:, 1] if 1 in rf_clf.classes_ else np.zeros(len(X))
    rf_preds = (rf_probs >= 0.5).astype(int)

    # Metrics evaluation
    prec = float(precision_score(y, rf_preds, zero_division=0))
    rec = float(recall_score(y, rf_preds, zero_division=0))
    f1 = float(f1_score(y, rf_preds, zero_division=0))
    try:
        roc = float(roc_auc_score(y, rf_probs))
    except Exception:
        roc = 0.5

    print(f"[+] Model Evaluation Metrics (Supervised RF):")
    print(f"    - Precision : {prec:.4f}")
    print(f"    - Recall    : {rec:.4f}")
    print(f"    - F1 Score  : {f1:.4f}")
    print(f"    - ROC-AUC   : {roc:.4f}")

    # Feature Importance
    feat_importances = dict(zip(FEATURE_COLUMNS, rf_clf.feature_importances_))
    sorted_importances = dict(sorted(feat_importances.items(), key=lambda x: x[1], reverse=True))

    print("\nFeature Importance Rankings:")
    for feat, imp in sorted_importances.items():
        print(f"    - {feat:<25}: {imp:.4f}")

    # Save model artifacts
    scaler_path = os.path.join(MODEL_DIR, "scaler.joblib")
    iso_path = os.path.join(MODEL_DIR, "isolation_forest.joblib")
    rf_path = os.path.join(MODEL_DIR, "random_forest.joblib")
    meta_path = os.path.join(MODEL_DIR, "model_metadata.json")

    joblib.dump(scaler, scaler_path)
    joblib.dump(iso_forest, iso_path)
    joblib.dump(rf_clf, rf_path)

    metadata = {
        "last_trained_at": datetime.now().isoformat(),
        "total_samples": len(df),
        "benign_samples": int((y == 0).sum()),
        "fraudulent_samples": int((y == 1).sum()),
        "features": FEATURE_COLUMNS,
        "feature_importances": sorted_importances,
        "metrics": {
            "precision": prec,
            "recall": rec,
            "f1_score": f1,
            "roc_auc": roc
        },
        "score_bounds": {
            "iso_min": float(min_s),
            "iso_max": float(max_s)
        }
    }

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n[+] Saved model artifacts to {MODEL_DIR}")
    return metadata

if __name__ == "__main__":
    db_p = sys.argv[1] if len(sys.argv) > 1 else None
    train_models(db_p)
