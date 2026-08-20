-- Migration: 001_initial.sql
-- Create initial core entities schema for Trinetra

-- 1. Locations
CREATE TABLE IF NOT EXISTS locations (
    location_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    region TEXT NOT NULL,
    synthetic_coordinates TEXT NOT NULL
);

-- 2. Point of Sales
CREATE TABLE IF NOT EXISTS point_of_sales (
    pos_id TEXT PRIMARY KEY,
    region TEXT NOT NULL,
    registration_date TEXT NOT NULL,
    operator TEXT NOT NULL
);

-- 3. Subscribers
CREATE TABLE IF NOT EXISTS subscribers (
    subscriber_id TEXT PRIMARY KEY,
    kyc_status TEXT NOT NULL,
    registration_date TEXT NOT NULL,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    pos_id TEXT NOT NULL,
    FOREIGN KEY (pos_id) REFERENCES point_of_sales(pos_id)
);

-- 4. SIMs
CREATE TABLE IF NOT EXISTS sims (
    sim_id TEXT PRIMARY KEY,
    mobile_number TEXT NOT NULL UNIQUE,
    subscriber_id TEXT NOT NULL,
    activation_date TEXT NOT NULL,
    deactivation_date TEXT,
    operator TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (subscriber_id) REFERENCES subscribers(subscriber_id)
);

-- 5. Devices
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    imei TEXT NOT NULL UNIQUE,
    tac TEXT NOT NULL,
    device_model TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    status TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
);

-- 6. SIM-Device Events
CREATE TABLE IF NOT EXISTS sim_device_events (
    event_id TEXT PRIMARY KEY,
    sim_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    location_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    FOREIGN KEY (sim_id) REFERENCES sims(sim_id),
    FOREIGN KEY (device_id) REFERENCES devices(device_id),
    FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

-- 7. Activation Events
CREATE TABLE IF NOT EXISTS activation_events (
    event_id TEXT PRIMARY KEY,
    sim_id TEXT NOT NULL,
    subscriber_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    pos_id TEXT NOT NULL,
    action TEXT NOT NULL,
    FOREIGN KEY (sim_id) REFERENCES sims(sim_id),
    FOREIGN KEY (subscriber_id) REFERENCES subscribers(subscriber_id),
    FOREIGN KEY (pos_id) REFERENCES point_of_sales(pos_id)
);

-- 8. Fraud Reports
CREATE TABLE IF NOT EXISTS fraud_reports (
    report_id TEXT PRIMARY KEY,
    mobile_number TEXT NOT NULL,
    report_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    severity TEXT NOT NULL,
    source TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (mobile_number) REFERENCES sims(mobile_number)
);

-- 9. Network Events
CREATE TABLE IF NOT EXISTS network_events (
    event_id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    device_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    FOREIGN KEY (mobile_number) REFERENCES sims(mobile_number),
    FOREIGN KEY (device_id) REFERENCES devices(device_id),
    FOREIGN KEY (location_id) REFERENCES locations(location_id)
);
