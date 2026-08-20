# त्रिनेत्र (Trinetra)
## A Multi-Layer Telecom Fraud Intelligence and Risk Detection Platform

Trinetra is an independent research prototype designed to explore multi-layer telecom fraud detection and explainable risk scoring using synthetic telecom network traces, rule engines, machine learning, and graph-based correlation.

---

## 1. Project Concept & Architecture

Trinetra correlates subscriber, SIM, device, and behavioral intelligence to identify anomalous behavior and calculate risk assessments:

```
                 त्रिनेत्र
                    │
        ┌───────────┼───────────┐
        ↓           ↓           ↓
    Subscriber    Device     Behaviour
    Intelligence Intelligence Intelligence
        │           │           │
        └───────────┼───────────┘
                    ↓
             Fraud Intelligence
                    ↓
               Risk Engine
                    ↓
             SQLite Database (trinetra.db)
```

---

## 2. Directory Structure

* **`data/`**: Relational database migration scripts and the canonical portable database file `trinetra.db`.
* **`data-generator/`**: Python simulator generating benign and 8 specific fraud scenario subscriber traces.
* **`backend/`**: Rust Axum Web API using SQLx for parameterized querying and executing the rule-based risk evaluation engine.
* **`dataset/`**: Publicly available FraudZen bypass fraud CDR trace data for external ML model experiments.
* **`private/`**: Project requirements, agent instruction manuals, and design guidelines.

---

## 3. Quickstart Guide

### Step 1: Initialize Python Environment and Populate Database
The synthetic data generator automatically runs database migrations and populates the SQLite database (`data/trinetra.db`) with 500+ subscribers and 8 specific fraud scenarios:
```bash
# Run from repository root
python data-generator/generator.py --clean
```
This generates the SQLite file `data/trinetra.db` and populates the locations, POS, subscribers, SIMs, devices, and event records.

### Step 2: Build and Run the Rust Backend
The backend executes Axum routes, connects to the SQLite pool, and exposes REST endpoints for subscriber metadata, device sharing profiles, audit trails, and manual risk evaluations.
```bash
# Navigate to the backend directory and run
cd backend
cargo run
```
The server will start on `http://127.0.0.1:3000`.

---

## 4. API Endpoints

### Subscribers & Risk Assessment
* `GET /api/subscribers`: Lists subscribers (supports pagination and query search `?q=`).
* `GET /api/subscribers/:id`: Detailed profile of a subscriber, including active SIMs, recent device history, recent network events, and risk assessment history.
* `POST /api/subscribers/:id/evaluate`: Runs the rule-based risk engine on a subscriber. If the score is HIGH or VERY HIGH, an investigation record is auto-generated.

### Devices
* `GET /api/devices`: Lists device entities.
* `GET /api/devices/:id`: Detailed device profile showing all SIMs ever loaded on it and recent events.

### Investigations & Audit Logs
* `GET /api/investigations`: Lists all active fraud investigations.
* `PUT /api/investigations/:id`: Update investigation status (e.g., `PENDING` to `UNDER_REVIEW` or `RESOLVED`) and investigator notes.
* `GET /api/audit_logs`: Fetch the system audit trail.

---

## 5. Risk Assessment & Rule Engine
The rule engine dynamically evaluates the following risk rules:
1. **SIM Concentration**: Checks if a subscriber owns > 9 SIM cards (+30 points).
2. **Device Sharing**: Checks if an IMEI is shared across > 5 distinct SIM cards (+25 points).
3. **Stolen Device**: Checks if subscriber SIMs are active on a blacklisted device IMEI (+40 points).
4. **Fraud Reports**: Multiplies external complaint counts (+15 points per report, max 40).
5. **Suspicious PoS**: Detects if the registration PoS dealer has a >30% fraud report rate (+15 points).
6. **Geographic Anomaly**: Identifies consecutive signaling events in different states within 1 hour (+20 points).

Scores are mapped into categorical risk levels:
* **0 - 24**: LOW
* **25 - 49**: MEDIUM
* **50 - 74**: HIGH (Triggers automatic Investigation)
* **75 - 100**: VERY HIGH (Triggers automatic Investigation)