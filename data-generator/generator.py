#!/usr/bin/env python3
import os
import sys
import sqlite3
import random
import uuid
from datetime import datetime, timedelta

def log(msg):
    print(f"[*] {msg}")

def log_success(msg):
    print(f"[+] {msg}")

def log_error(msg):
    print(f"[-] {msg}", file=sys.stderr)

def run_migrations(db_path, migrations_dir):
    log(f"Running migrations from {migrations_dir} on {db_path}...")
    if not os.path.exists(migrations_dir):
        log_error(f"Migrations directory '{migrations_dir}' does not exist.")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    # Find SQL files in migrations directory
    migration_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith('.sql')])
    for filename in migration_files:
        filepath = os.path.join(migrations_dir, filename)
        log(f"Applying migration: {filename}")
        with open(filepath, 'r', encoding='utf-8') as f:
            sql_script = f.read()
        try:
            cursor.executescript(sql_script)
        except sqlite3.Error as e:
            log_error(f"Failed to apply migration {filename}: {e}")
            conn.close()
            sys.exit(1)
    
    conn.commit()
    conn.close()
    log_success("Migrations applied successfully.")

def generate_imei():
    # TAC (6 digits) + FAC (2 digits) + SNR (6 digits) + Check digit
    tac = "".join([str(random.randint(0, 9)) for _ in range(6)])
    fac = "01"
    snr = "".join([str(random.randint(0, 9)) for _ in range(6)])
    body = tac + fac + snr
    
    # Luhn algorithm for check digit
    total = 0
    for idx, digit in enumerate(body):
        num = int(digit)
        if idx % 2 == 1:
            num *= 2
            if num > 9:
                num -= 9
        total += num
    check_digit = (10 - (total % 10)) % 10
    return body + str(check_digit), tac

def generate_phone_number():
    # Format: +91 followed by 10 digits starting with 7, 8, or 9
    return "+91" + str(random.randint(7, 9)) + "".join([str(random.randint(0, 9)) for _ in range(9)])

def populate_data(db_path, scale=1.0):
    log(f"Populating synthetic data (scale: {scale})...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    # Check if empty, delete existing if needed. Here we insert fresh or fail on PK.
    # To keep it simple, we clear existing table data first to enable clean re-runs
    tables = [
        "network_events", "fraud_reports", "activation_events", "sim_device_events",
        "devices", "sims", "subscribers", "point_of_sales", "locations",
        "investigations", "risk_assessments", "audit_logs"
    ]
    for t in tables:
        try:
            cursor.execute(f"DELETE FROM {t};")
        except sqlite3.OperationalError:
            # Table might not exist yet if migrations weren't run
            pass
    conn.commit()

    # 1. Locations
    locations_data = [
        ("LOC_001", "Delhi", "New Delhi", "North", "28.6139,77.2090"),
        ("LOC_002", "Maharashtra", "Mumbai City", "West", "19.0760,72.8777"),
        ("LOC_003", "Karnataka", "Bengaluru Urban", "South", "12.9716,77.5946"),
        ("LOC_004", "Tamil Nadu", "Chennai", "South", "13.0827,80.2707"),
        ("LOC_005", "West Bengal", "Kolkata", "East", "22.5726,88.3639"),
        ("LOC_006", "Telangana", "Hyderabad", "South", "17.3850,78.4867"),
        ("LOC_007", "Gujarat", "Ahmedabad", "West", "23.0225,72.5714"),
        ("LOC_008", "Rajasthan", "Jaipur", "North", "26.9124,75.7873"),
        ("LOC_009", "Uttar Pradesh", "Lucknow", "North", "26.8467,80.9462"),
        ("LOC_010", "Maharashtra", "Pune", "West", "18.5204,73.8567")
    ]
    cursor.executemany("INSERT INTO locations VALUES (?, ?, ?, ?, ?);", locations_data)
    log(f"Generated {len(locations_data)} locations.")

    # 2. Point of Sales (PoS)
    operators = ["Jio", "Airtel", "Vi", "BSNL"]
    regions = ["North", "South", "East", "West"]
    pos_list = []
    num_pos = int(30 * scale)
    for i in range(1, num_pos + 1):
        pos_id = f"POS_{i:03d}"
        region = random.choice(regions)
        reg_date = (datetime.now() - timedelta(days=random.randint(100, 1000))).isoformat()
        operator = random.choice(operators)
        pos_list.append((pos_id, region, reg_date, operator))
    cursor.executemany("INSERT INTO point_of_sales VALUES (?, ?, ?, ?);", pos_list)
    log(f"Generated {len(pos_list)} Point of Sales.")

    # 3. Subscribers (Benign)
    subscribers = []
    kyc_statuses = ["VERIFIED", "VERIFIED", "VERIFIED", "PENDING", "SUSPENDED"]
    states_districts = [
        ("Delhi", "New Delhi"),
        ("Maharashtra", "Mumbai City"),
        ("Karnataka", "Bengaluru Urban"),
        ("Tamil Nadu", "Chennai"),
        ("West Bengal", "Kolkata")
    ]
    num_subs = int(500 * scale)
    for i in range(1, num_subs + 1):
        sub_id = f"SUB_BENIGN_{i:04d}"
        kyc = random.choice(kyc_statuses)
        reg_date = (datetime.now() - timedelta(days=random.randint(10, 500))).isoformat()
        state, district = random.choice(states_districts)
        pos = random.choice(pos_list)[0]
        subscribers.append((sub_id, kyc, reg_date, state, district, pos))
    cursor.executemany("INSERT INTO subscribers VALUES (?, ?, ?, ?, ?, ?);", subscribers)
    log(f"Generated {len(subscribers)} benign subscribers.")

    # 4. SIMs (Benign)
    sims = []
    sim_statuses = ["ACTIVE", "ACTIVE", "ACTIVE", "INACTIVE", "SUSPENDED"]
    num_sims = int(600 * scale)
    sim_index = 1
    for sub in subscribers:
        # Most subscribers have 1 SIM, some have 2
        for _ in range(random.choice([1, 1, 1, 2])):
            sim_id = f"SIM_BENIGN_{sim_index:04d}"
            number = generate_phone_number()
            sub_id = sub[0]
            act_date = sub[2] # activated around registration
            deact_date = None
            status = random.choice(sim_statuses)
            if status == "INACTIVE" or status == "SUSPENDED":
                deact_date = (datetime.fromisoformat(act_date) + timedelta(days=random.randint(5, 50))).isoformat()
            operator = random.choice(operators)
            sims.append((sim_id, number, sub_id, act_date, deact_date, operator, status))
            sim_index += 1
            if len(sims) >= num_sims:
                break
        if len(sims) >= num_sims:
            break
    cursor.executemany("INSERT INTO sims VALUES (?, ?, ?, ?, ?, ?, ?);", sims)
    log(f"Generated {len(sims)} benign SIMs.")

    # 5. Devices (Benign)
    devices = []
    device_models = [
        ("Samsung Galaxy S23", "Samsung"),
        ("iPhone 14", "Apple"),
        ("Redmi Note 12", "Xiaomi"),
        ("OnePlus 11", "OnePlus"),
        ("Pixel 7", "Google"),
        ("Moto G62", "Motorola")
    ]
    num_devices = int(550 * scale)
    for i in range(1, num_devices + 1):
        dev_id = f"DEV_BENIGN_{i:04d}"
        imei, tac = generate_imei()
        model, mfr = random.choice(device_models)
        status = "NORMAL"
        first_seen = (datetime.now() - timedelta(days=random.randint(30, 300))).isoformat()
        last_seen = (datetime.now() - timedelta(hours=random.randint(1, 24))).isoformat()
        devices.append((dev_id, imei, tac, model, mfr, status, first_seen, last_seen))
    cursor.executemany("INSERT INTO devices VALUES (?, ?, ?, ?, ?, ?, ?, ?);", devices)
    log(f"Generated {len(devices)} benign devices.")

    # 6. Events (Benign Activation, SIM-Device usage, and Network events)
    activation_events = []
    sim_device_events = []
    network_events = []
    
    # Benign activations
    for idx, sim in enumerate(sims):
        sim_id, _, sub_id, act_date, _, _, _ = sim
        # Find subscriber PoS
        cursor.execute("SELECT pos_id FROM subscribers WHERE subscriber_id = ?;", (sub_id,))
        pos_id = cursor.fetchone()[0]
        event_id = f"EV_ACT_B_{idx:05d}"
        activation_events.append((event_id, sim_id, sub_id, act_date, pos_id, "ACTIVATION"))

    # Benign device associations
    for idx, sim in enumerate(sims):
        sim_id, msisdn, _, act_date, _, _, _ = sim
        device = random.choice(devices)
        dev_id = device[0]
        imei = device[1]
        
        # Device association event
        event_id = f"EV_SD_B_{idx:05d}"
        loc_id = random.choice(locations_data)[0]
        timestamp = (datetime.fromisoformat(act_date) + timedelta(minutes=random.randint(5, 60))).isoformat()
        sim_device_events.append((event_id, sim_id, dev_id, timestamp, loc_id, "ASSOCIATE"))

        # Generate some network call CDRs for this SIM
        for c in range(random.randint(2, 8)):
            cdr_id = f"EV_NET_B_{idx:05d}_{c}"
            cdr_time = (datetime.fromisoformat(timestamp) + timedelta(days=random.randint(1, 10), hours=random.randint(0, 23))).isoformat()
            cdr_loc = random.choice(locations_data)[0]
            cdr_type = random.choice(["CALL_OUT", "CALL_IN", "SMS_OUT", "SMS_IN"])
            network_events.append((cdr_id, cdr_time, msisdn, dev_id, cdr_loc, cdr_type))

    cursor.executemany("INSERT INTO activation_events VALUES (?, ?, ?, ?, ?, ?);", activation_events)
    cursor.executemany("INSERT INTO sim_device_events VALUES (?, ?, ?, ?, ?, ?);", sim_device_events)
    cursor.executemany("INSERT INTO network_events VALUES (?, ?, ?, ?, ?, ?);", network_events)
    log("Generated benign events (activations, associations, CD-events).")

    # ------------------ FRAUD SCENARIOS ------------------
    log("Simulating fraud scenarios...")
    
    # S01 — SIM Concentration: One subscriber owns > 9 SIM cards
    log("Simulating S01 — SIM Concentration")
    s01_sub_id = "SUB_S01_CONC"
    cursor.execute("INSERT INTO subscribers VALUES (?, ?, ?, ?, ?, ?);",
                   (s01_sub_id, "VERIFIED", datetime.now().isoformat(), "Delhi", "New Delhi", "POS_001"))
    
    s01_sims = []
    s01_activations = []
    for i in range(1, 15): # 14 SIMs under one subscriber
        sim_id = f"SIM_S01_{i:02d}"
        number = generate_phone_number()
        act_date = (datetime.now() - timedelta(days=2)).isoformat()
        s01_sims.append((sim_id, number, s01_sub_id, act_date, None, "Jio", "ACTIVE"))
        s01_activations.append((f"EV_ACT_S01_{i:02d}", sim_id, s01_sub_id, act_date, "POS_001", "ACTIVATION"))
    cursor.executemany("INSERT INTO sims VALUES (?, ?, ?, ?, ?, ?, ?);", s01_sims)
    cursor.executemany("INSERT INTO activation_events VALUES (?, ?, ?, ?, ?, ?);", s01_activations)

    # S02 — Device Sharing: One device IMEI used by many distinct SIMs sequentially (SIMBox)
    log("Simulating S02 — Device Sharing (SIMBox)")
    s02_dev_id = "DEV_S02_SHR"
    s02_imei, s02_tac = generate_imei()
    cursor.execute("INSERT INTO devices VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
                   (s02_dev_id, s02_imei, s02_tac, "SIMBox Multi-port", "Generic", "NORMAL", 
                    datetime.now().isoformat(), datetime.now().isoformat()))
    
    base_time = datetime.now() - timedelta(hours=12)
    s02_sim_devs = []
    s02_net_events = []
    for i in range(1, 25): # 24 SIMs sequentially in 1 device
        sim_id = f"SIM_S02_{i:02d}"
        number = generate_phone_number()
        sub_id = f"SUB_S02_{i:02d}"
        act_date = (base_time - timedelta(days=1)).isoformat()
        
        # Create subscriber and SIM
        cursor.execute("INSERT INTO subscribers VALUES (?, ?, ?, ?, ?, ?);",
                       (sub_id, "VERIFIED", act_date, "Maharashtra", "Mumbai City", "POS_002"))
        cursor.execute("INSERT INTO sims VALUES (?, ?, ?, ?, ?, ?, ?);",
                       (sim_id, number, sub_id, act_date, None, "Airtel", "ACTIVE"))
        
        # Device association event
        assoc_time = (base_time + timedelta(minutes=30 * i)).isoformat()
        s02_sim_devs.append((f"EV_SD_S02_{i:02d}", sim_id, s02_dev_id, assoc_time, "LOC_002", "ASSOCIATE"))
        
        # Network call using this SIM in the shared device
        s02_net_events.append((f"EV_NET_S02_{i:02d}", assoc_time, number, s02_dev_id, "LOC_002", "CALL_OUT"))
        
    cursor.executemany("INSERT INTO sim_device_events VALUES (?, ?, ?, ?, ?, ?);", s02_sim_devs)
    cursor.executemany("INSERT INTO network_events VALUES (?, ?, ?, ?, ?, ?);", s02_net_events)

    # S03 — Rapid Activation: Many SIMs activated at a single PoS in a very short window
    log("Simulating S03 — Rapid Activation at single PoS")
    s03_pos_id = "POS_S03_RPD"
    cursor.execute("INSERT INTO point_of_sales VALUES (?, ?, ?, ?);",
                   (s03_pos_id, "South", (datetime.now() - timedelta(days=30)).isoformat(), "Vi"))
    
    s03_subscribers = []
    s03_sims = []
    s03_activations = []
    activation_base = datetime.now() - timedelta(hours=3)
    for i in range(1, 31): # 30 activations in 30 minutes
        sub_id = f"SUB_S03_{i:02d}"
        sim_id = f"SIM_S03_{i:02d}"
        number = generate_phone_number()
        timestamp = (activation_base + timedelta(minutes=i)).isoformat()
        
        s03_subscribers.append((sub_id, "VERIFIED", timestamp, "Karnataka", "Bengaluru Urban", s03_pos_id))
        s03_sims.append((sim_id, number, sub_id, timestamp, None, "Vi", "ACTIVE"))
        s03_activations.append((f"EV_ACT_S03_{i:02d}", sim_id, sub_id, timestamp, s03_pos_id, "ACTIVATION"))
        
    cursor.executemany("INSERT INTO subscribers VALUES (?, ?, ?, ?, ?, ?);", s03_subscribers)
    cursor.executemany("INSERT INTO sims VALUES (?, ?, ?, ?, ?, ?, ?);", s03_sims)
    cursor.executemany("INSERT INTO activation_events VALUES (?, ?, ?, ?, ?, ?);", s03_activations)

    # S04 — Stolen Device Reuse: A blacklisted device ID exhibiting activity
    log("Simulating S04 — Stolen Device Reuse")
    s04_dev_id = "DEV_S04_STLN"
    s04_imei, s04_tac = generate_imei()
    cursor.execute("INSERT INTO devices VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
                   (s04_dev_id, s04_imei, s04_tac, "iPhone X", "Apple", "STOLEN", 
                    (datetime.now() - timedelta(days=20)).isoformat(), datetime.now().isoformat()))
    
    s04_sub_id = "SUB_S04_USER"
    s04_sim_id = "SIM_S04_USED"
    s04_number = generate_phone_number()
    act_date = (datetime.now() - timedelta(days=10)).isoformat()
    cursor.execute("INSERT INTO subscribers VALUES (?, ?, ?, ?, ?, ?);",
                   (s04_sub_id, "VERIFIED", act_date, "Tamil Nadu", "Chennai", "POS_003"))
    cursor.execute("INSERT INTO sims VALUES (?, ?, ?, ?, ?, ?, ?);",
                   (s04_sim_id, s04_number, s04_sub_id, act_date, None, "Jio", "ACTIVE"))
    
    # Event of stolen device usage (today)
    today = datetime.now().isoformat()
    cursor.execute("INSERT INTO sim_device_events VALUES (?, ?, ?, ?, ?, ?);",
                   ("EV_SD_S04_01", s04_sim_id, s04_dev_id, today, "LOC_004", "ASSOCIATE"))
    cursor.execute("INSERT INTO network_events VALUES (?, ?, ?, ?, ?, ?);",
                   ("EV_NET_S04_01", today, s04_number, s04_dev_id, "LOC_004", "CALL_OUT"))

    # S05 — Suspicious PoS: High fraud reporting rate from activations at a single PoS
    log("Simulating S05 — Suspicious PoS (high report rate)")
    s05_pos_id = "POS_S05_SUSP"
    cursor.execute("INSERT INTO point_of_sales VALUES (?, ?, ?, ?);",
                   (s05_pos_id, "East", (datetime.now() - timedelta(days=150)).isoformat(), "Airtel"))
    
    s05_subscribers = []
    s05_sims = []
    s05_activations = []
    s05_reports = []
    
    for i in range(1, 11): # 10 activations
        sub_id = f"SUB_S05_{i:02d}"
        sim_id = f"SIM_S05_{i:02d}"
        number = generate_phone_number()
        timestamp = (datetime.now() - timedelta(days=15 - i)).isoformat()
        
        s05_subscribers.append((sub_id, "VERIFIED", timestamp, "West Bengal", "Kolkata", s05_pos_id))
        s05_sims.append((sim_id, number, sub_id, timestamp, None, "Airtel", "ACTIVE"))
        s05_activations.append((f"EV_ACT_S05_{i:02d}", sim_id, sub_id, timestamp, s05_pos_id, "ACTIVATION"))
        
        # 7 out of 10 get reported for fraud (70% fraud rate!)
        if i <= 7:
            report_time = (datetime.now() - timedelta(days=1)).isoformat()
            s05_reports.append((f"REP_S05_{i:02d}", number, "SPAM_CALL", report_time, "HIGH", "portal", "Spam calls offering illegal services"))
            
    cursor.executemany("INSERT INTO subscribers VALUES (?, ?, ?, ?, ?, ?);", s05_subscribers)
    cursor.executemany("INSERT INTO sims VALUES (?, ?, ?, ?, ?, ?, ?);", s05_sims)
    cursor.executemany("INSERT INTO activation_events VALUES (?, ?, ?, ?, ?, ?);", s05_activations)
    cursor.executemany("INSERT INTO fraud_reports VALUES (?, ?, ?, ?, ?, ?, ?);", s05_reports)

    # S06 — Fraud Report Cluster: Multiple fraud reports on a single number
    log("Simulating S06 — Fraud Report Cluster")
    s06_sub_id = "SUB_S06_TRG"
    s06_sim_id = "SIM_S06_TRG"
    s06_number = generate_phone_number()
    act_date = (datetime.now() - timedelta(days=30)).isoformat()
    cursor.execute("INSERT INTO subscribers VALUES (?, ?, ?, ?, ?, ?);",
                   (s06_sub_id, "VERIFIED", act_date, "Rajasthan", "Jaipur", "POS_004"))
    cursor.execute("INSERT INTO sims VALUES (?, ?, ?, ?, ?, ?, ?);",
                   (s06_sim_id, s06_number, s06_sub_id, act_date, None, "Jio", "ACTIVE"))
    
    # 5 reports on this single number
    s06_reports = []
    sources = ["portal", "sms", "call_center", "app", "police"]
    for i in range(5):
        timestamp = (datetime.now() - timedelta(days=5 - i)).isoformat()
        s06_reports.append((f"REP_S06_{i:02d}", s06_number, "IMPERSONATION", timestamp, "CRITICAL", sources[i], "Impersonating government officers to extort money"))
    cursor.executemany("INSERT INTO fraud_reports VALUES (?, ?, ?, ?, ?, ?, ?);", s06_reports)

    # S07 — Geographic Anomaly: Fast sequential events from distant locations (impossible travel)
    log("Simulating S07 — Geographic Anomaly (impossible travel)")
    s07_sub_id = "SUB_S07_GEO"
    s07_sim_id = "SIM_S07_GEO"
    s07_dev_id = "DEV_S07_GEO"
    s07_number = generate_phone_number()
    s07_imei, s07_tac = generate_imei()
    act_date = (datetime.now() - timedelta(days=10)).isoformat()
    
    cursor.execute("INSERT INTO subscribers VALUES (?, ?, ?, ?, ?, ?);",
                   (s07_sub_id, "VERIFIED", act_date, "Delhi", "New Delhi", "POS_005"))
    cursor.execute("INSERT INTO sims VALUES (?, ?, ?, ?, ?, ?, ?);",
                   (s07_sim_id, s07_number, s07_sub_id, act_date, None, "BSNL", "ACTIVE"))
    cursor.execute("INSERT INTO devices VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
                   (s07_dev_id, s07_imei, s07_tac, "OnePlus Nord", "OnePlus", "NORMAL", act_date, today))
    
    # Event 1: Delhi, 12:00:00
    t1 = (datetime.now() - timedelta(hours=1)).replace(minute=0, second=0, microsecond=0).isoformat()
    cursor.execute("INSERT INTO sim_device_events VALUES (?, ?, ?, ?, ?, ?);",
                   ("EV_SD_S07_01", s07_sim_id, s07_dev_id, t1, "LOC_001", "ASSOCIATE"))
    cursor.execute("INSERT INTO network_events VALUES (?, ?, ?, ?, ?, ?);",
                   ("EV_NET_S07_01", t1, s07_number, s07_dev_id, "LOC_001", "CALL_OUT"))
    
    # Event 2: Bengaluru (~1700km away), 12:05:00 (5 minutes later)
    t2 = (datetime.now() - timedelta(hours=1)).replace(minute=5, second=0, microsecond=0).isoformat()
    cursor.execute("INSERT INTO sim_device_events VALUES (?, ?, ?, ?, ?, ?);",
                   ("EV_SD_S07_02", s07_sim_id, s07_dev_id, t2, "LOC_003", "ASSOCIATE"))
    cursor.execute("INSERT INTO network_events VALUES (?, ?, ?, ?, ?, ?);",
                   ("EV_NET_S07_02", t2, s07_number, s07_dev_id, "LOC_003", "CALL_IN"))

    # S08 — Multi-Entity Fraud Cluster: Correlated PoS, Device and multiple subscribers
    log("Simulating S08 — Multi-Entity Fraud Cluster")
    s08_pos_id = "POS_S08_CLST"
    cursor.execute("INSERT INTO point_of_sales VALUES (?, ?, ?, ?);",
                   (s08_pos_id, "North", (datetime.now() - timedelta(days=200)).isoformat(), "Jio"))
    
    s08_dev_id = "DEV_S08_CLST"
    s08_imei, s08_tac = generate_imei()
    cursor.execute("INSERT INTO devices VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
                   (s08_dev_id, s08_imei, s08_tac, "Redmi 10", "Xiaomi", "NORMAL", 
                    (datetime.now() - timedelta(days=10)).isoformat(), today))
    
    s08_time = (datetime.now() - timedelta(days=5)).isoformat()
    for i in range(1, 4): # 3 subscribers
        sub_id = f"SUB_S08_{i}"
        sim_id = f"SIM_S08_{i}"
        number = generate_phone_number()
        
        cursor.execute("INSERT INTO subscribers VALUES (?, ?, ?, ?, ?, ?);",
                       (sub_id, "PENDING", s08_time, "Uttar Pradesh", "Lucknow", s08_pos_id))
        cursor.execute("INSERT INTO sims VALUES (?, ?, ?, ?, ?, ?, ?);",
                       (sim_id, number, sub_id, s08_time, None, "Jio", "ACTIVE"))
        
        # All associate with the same device
        cursor.execute("INSERT INTO sim_device_events VALUES (?, ?, ?, ?, ?, ?);",
                       (f"EV_SD_S08_{i}", sim_id, s08_dev_id, s08_time, "LOC_009", "ASSOCIATE"))
        
        # All get reported
        cursor.execute("INSERT INTO fraud_reports VALUES (?, ?, ?, ?, ?, ?, ?);",
                       (f"REP_S08_{i}", number, "FINANCIAL_FRAUD", today, "CRITICAL", "police", "Linked to phishing scams"))
        
    conn.commit()
    conn.close()
    log_success("Database population completed successfully.")

def verify_db(db_path):
    log(f"Verifying database: {db_path}")
    if not os.path.exists(db_path):
        log_error(f"Database file '{db_path}' does not exist.")
        sys.exit(1)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Run integrity check
    cursor.execute("PRAGMA integrity_check;")
    res = cursor.fetchone()[0]
    if res == "ok":
        log_success("SQLite Integrity check: OK")
    else:
        log_error(f"SQLite Integrity check failed: {res}")
        conn.close()
        sys.exit(1)
        
    # 2. Check table counts
    tables = [
        "locations", "point_of_sales", "subscribers", "sims", "devices",
        "sim_device_events", "activation_events", "fraud_reports", "network_events"
    ]
    
    for t in tables:
        cursor.execute(f"SELECT COUNT(*) FROM {t};")
        count = cursor.fetchone()[0]
        log(f"Table '{t}': {count} records")
        
    conn.close()
    log_success("Database verification completed.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Trinetra Synthetic Data Generator")
    parser.add_argument("--db-path", default="data/trinetra.db", help="Path to SQLite database")
    parser.add_argument("--migrations-dir", default="data/migrations", help="Path to SQL migrations folder")
    parser.add_argument("--check", action="store_true", help="Only verify the database structure and counts")
    parser.add_argument("--clean", action="store_true", help="Delete existing database file before generation")
    parser.add_argument("--scale", type=float, default=1.0, help="Scale factor for generation (default: 1.0)")
    
    args = parser.parse_args()
    
    # Ensure directory containing db exists
    db_dir = os.path.dirname(args.db_path)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
        
    if args.clean and os.path.exists(args.db_path):
        log(f"Cleaning database file: {args.db_path}")
        os.remove(args.db_path)
        
    if args.check:
        verify_db(args.db_path)
    else:
        run_migrations(args.db_path, args.migrations_dir)
        populate_data(args.db_path, scale=args.scale)
        verify_db(args.db_path)
