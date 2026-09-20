#!/usr/bin/env python3
"""
Trinetra — ML Feature Extractor (ml/features.py)
Extracts multi-layer telecom feature vectors for subscribers from SQLite database (trinetra.db).
"""

import os
import sys
import sqlite3
import pandas as pd
import numpy as np
from datetime import datetime

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "trinetra.db")

FEATURE_COLUMNS = [
    "sim_count",
    "device_count",
    "max_device_sharing",
    "stolen_device_flag",
    "fraud_report_count",
    "pos_fraud_rate",
    "geo_anomaly_count",
    "kyc_status_score",
    "sim_to_device_ratio",
    "activation_recency_days",
    "network_event_density"
]

def extract_features(db_path=DEFAULT_DB_PATH):
    """
    Queries trinetra.db and constructs a pandas DataFrame of features per subscriber.
    """
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database file not found at {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Fetch all subscribers
    subs = pd.read_sql_query("""
        SELECT subscriber_id, kyc_status, registration_date, state, district, pos_id
        FROM subscribers
    """, conn)

    if subs.empty:
        conn.close()
        return pd.DataFrame(), pd.Series()

    # 2. Compute SIM counts per subscriber
    sim_counts = pd.read_sql_query("""
        SELECT subscriber_id, COUNT(*) as sim_count
        FROM sims
        GROUP BY subscriber_id
    """, conn).set_index("subscriber_id")

    # 3. Compute distinct Device counts per subscriber
    dev_counts = pd.read_sql_query("""
        SELECT s.subscriber_id, COUNT(DISTINCT sde.device_id) as device_count
        FROM sims s
        JOIN sim_device_events sde ON s.sim_id = sde.sim_id
        GROUP BY s.subscriber_id
    """, conn).set_index("subscriber_id")

    # 4. Compute Max Device Sharing (max SIMs sharing any IMEI associated with sub's SIMs)
    max_sharing = pd.read_sql_query("""
        SELECT sub_sims.subscriber_id, COALESCE(MAX(dev_sim_counts.sim_cnt), 0) as max_device_sharing
        FROM (
            SELECT DISTINCT s.subscriber_id, sde.device_id
            FROM sims s
            JOIN sim_device_events sde ON s.sim_id = sde.sim_id
        ) sub_sims
        JOIN (
            SELECT device_id, COUNT(DISTINCT sim_id) as sim_cnt
            FROM sim_device_events
            GROUP BY device_id
        ) dev_sim_counts ON sub_sims.device_id = dev_sim_counts.device_id
        GROUP BY sub_sims.subscriber_id
    """, conn).set_index("subscriber_id")

    # 5. Stolen Device reuse count per subscriber
    stolen_devs = pd.read_sql_query("""
        SELECT s.subscriber_id, COUNT(DISTINCT d.device_id) as stolen_device_flag
        FROM sims s
        JOIN sim_device_events sde ON s.sim_id = sde.sim_id
        JOIN devices d ON sde.device_id = d.device_id
        WHERE d.status IN ('STOLEN', 'LOST')
        GROUP BY s.subscriber_id
    """, conn).set_index("subscriber_id")

    # 6. Fraud Report count per subscriber
    fraud_reports = pd.read_sql_query("""
        SELECT s.subscriber_id, COUNT(fr.report_id) as fraud_report_count
        FROM sims s
        JOIN fraud_reports fr ON s.mobile_number = fr.mobile_number
        GROUP BY s.subscriber_id
    """, conn).set_index("subscriber_id")

    # 7. PoS Fraud Rate
    pos_stats = pd.read_sql_query("""
        SELECT pos_id, COUNT(*) as total_activations
        FROM activation_events
        GROUP BY pos_id
    """, conn).set_index("pos_id")

    pos_reported = pd.read_sql_query("""
        SELECT ae.pos_id, COUNT(DISTINCT ae.sim_id) as reported_activations
        FROM activation_events ae
        JOIN sims s ON ae.sim_id = s.sim_id
        JOIN fraud_reports fr ON s.mobile_number = fr.mobile_number
        GROUP BY ae.pos_id
    """, conn).set_index("pos_id")

    pos_rates = pos_stats.join(pos_reported, how="left").fillna(0)
    pos_rates["pos_fraud_rate"] = pos_rates.apply(
        lambda r: (r["reported_activations"] / r["total_activations"]) if r["total_activations"] > 0 else 0.0,
        axis=1
    )
    pos_rate_dict = pos_rates["pos_fraud_rate"].to_dict()

    # 8. Network events & Geographic Anomaly Count
    net_events = pd.read_sql_query("""
        SELECT s.subscriber_id, COUNT(ne.event_id) as network_event_density
        FROM sims s
        JOIN network_events ne ON s.mobile_number = ne.mobile_number
        GROUP BY s.subscriber_id
    """, conn).set_index("subscriber_id")

    # Geo anomaly calculation (consecutive signaling events in diff state < 1hr)
    geo_events = pd.read_sql_query("""
        SELECT s.subscriber_id, ne.timestamp, l.state
        FROM sims s
        JOIN network_events ne ON s.mobile_number = ne.mobile_number
        JOIN locations l ON ne.location_id = l.location_id
        ORDER BY s.subscriber_id, ne.timestamp ASC
    """, conn)

    geo_anom_dict = {}
    if not geo_events.empty:
        for sub_id, group in geo_events.groupby("subscriber_id"):
            anom_cnt = 0
            rows = group.to_dict("records")
            for i in range(len(rows) - 1):
                r1, r2 = rows[i], rows[i+1]
                if r1["state"] != r2["state"]:
                    try:
                        t1 = datetime.fromisoformat(r1["timestamp"][:19])
                        t2 = datetime.fromisoformat(r2["timestamp"][:19])
                        if abs((t2 - t1).total_seconds()) < 3600:
                            anom_cnt += 1
                    except Exception:
                        pass
            geo_anom_dict[sub_id] = anom_cnt

    conn.close()

    # Assemble feature matrix
    now = datetime.now()

    records = []
    subscriber_ids = []
    labels = []

    for _, row in subs.iterrows():
        sid = row["subscriber_id"]
        subscriber_ids.append(sid)

        sc = int(sim_counts.loc[sid, "sim_count"]) if sid in sim_counts.index else 0
        dc = int(dev_counts.loc[sid, "device_count"]) if sid in dev_counts.index else 0
        ms = int(max_sharing.loc[sid, "max_device_sharing"]) if sid in max_sharing.index else 0
        sd = int(stolen_devs.loc[sid, "stolen_device_flag"]) if sid in stolen_devs.index else 0
        fr = int(fraud_reports.loc[sid, "fraud_report_count"]) if sid in fraud_reports.index else 0
        pfr = float(pos_rate_dict.get(row["pos_id"], 0.0))
        ga = int(geo_anom_dict.get(sid, 0))
        ne_density = int(net_events.loc[sid, "network_event_density"]) if sid in net_events.index else 0

        # KYC encoding
        kyc_map = {"VERIFIED": 0, "PENDING": 1, "SUSPENDED": 2, "REJECTED": 2}
        kyc_score = kyc_map.get(str(row["kyc_status"]).upper(), 1)

        # Ratio
        ratio = float(sc) / max(1.0, float(dc))

        # Recency in days
        try:
            reg_dt = datetime.fromisoformat(str(row["registration_date"])[:19])
            recency = max(0, (now - reg_dt).days)
        except Exception:
            recency = 30

        # Ground truth label (1 = fraudulent scenario subscriber, 0 = benign)
        is_fraud = 0 if "BENIGN" in sid else 1
        labels.append(is_fraud)

        rec = {
            "subscriber_id": sid,
            "sim_count": sc,
            "device_count": dc,
            "max_device_sharing": ms,
            "stolen_device_flag": sd,
            "fraud_report_count": fr,
            "pos_fraud_rate": pfr,
            "geo_anomaly_count": ga,
            "kyc_status_score": kyc_score,
            "sim_to_device_ratio": ratio,
            "activation_recency_days": recency,
            "network_event_density": ne_density
        }
        records.append(rec)

    df = pd.DataFrame(records)
    labels_series = pd.Series(labels, index=subscriber_ids)
    return df, labels_series

if __name__ == "__main__":
    db_p = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB_PATH
    print(f"[*] Extracting features from {db_p}...")
    df, y = extract_features(db_p)
    print(f"[+] Extracted {len(df)} subscriber feature vectors.")
    print(df[FEATURE_COLUMNS].head())
    print("\nFeature Summary:")
    print(df[FEATURE_COLUMNS].describe().T[["mean", "min", "max"]])
