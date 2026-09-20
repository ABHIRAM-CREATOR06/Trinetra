<div align="center">

![Trinetra banner](./assets/banner.png)

# त्रिनेत्र · Trinetra

**A multi-layer telecom fraud intelligence and risk detection platform**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Backend](https://img.shields.io/badge/backend-Rust%20%2F%20Axum-orange)](backend)
[![Frontend](https://img.shields.io/badge/frontend-Vanilla%20JS-yellow)](frontend)
[![Data Generator](https://img.shields.io/badge/data--generator-Python-blue)](data-generator)
[![Database](https://img.shields.io/badge/database-SQLite-lightgrey)](data)
[![Docker](https://img.shields.io/badge/docker-ready-blue?logo=docker&logoColor=white)](docker-compose.yml)
[![Phase](https://img.shields.io/badge/phase-1%2C%202%20%26%204%20complete-brightgreen)]()

</div>

---

Trinetra is an independent research prototype exploring multi-layer telecom fraud detection and explainable risk scoring. It correlates subscriber, SIM, device, and behavioral signals over synthetic telecom network traces to identify anomalies and flag investigations — every score comes with a breakdown of exactly which rules produced it.

The project is scoped in phases. **Phases 1, 2, and 4 (including Iterations 2, 3 & 4: UI Enhancements, Data Entry Pipelines, & ML Intelligence Layer) are complete and functional today.**

## Table of Contents

- [Why Trinetra](#why-trinetra)
- [Project Status](#project-status)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Quickstart](#quickstart)
  - [Option A: Windows One-Click Setup](#option-a-windows-one-click-setup)
  - [Option B: Cross-Platform Setup via Docker](#option-b-cross-platform-setup-via-docker)
  - [Option C: Manual Local Setup](#option-c-manual-local-setup)
- [API Reference](#api-reference)
- [Risk Engine](#risk-engine)
- [Investigation Dashboard & Data Entry](#investigation-dashboard--data-entry)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Roadmap](#roadmap)
- [License](#license)

## Why Trinetra

Most fraud detection systems produce a score with no explanation attached. Trinetra is built around the opposite premise: every risk score should be traceable to specific, auditable rules, and every flagged subscriber should generate an investigation record with a clear, human-readable reason. That principle holds across every phase, from the rule engine through manual operational data entry and future ML and graph layers.

## Project Status

| Phase | Scope | Status |
|---|---|---|
| **Phase 1 — Foundation & Detection** | Data model, synthetic data generator, SQLite database, migrations, REST API, rule-based risk engine, explainable scoring | **Complete** |
| **Phase 2 — Machine Learning** | Feature engineering, anomaly detection (Isolation Forest, Random Forest) integrated into hybrid risk engine | **Complete (Iter 4)** |
| Phase 3 — Graph Intelligence | Entity relationship graph (NetworkX), cluster detection across subscribers/SIMs/devices | Planned |
| **Phase 4 — Investigation & Operations Platform** | Vanilla JS SPA dashboard, subscriber/device browser, risk trend sparklines, bulk evaluate queue, investigation workflow, audit log, **Manual Data Entry Pipelines (Iteration 3)** | **Complete** |
| Phase 5 — Research | Ablation studies, benchmarking, formal evaluation (precision/recall/F1/ROC-AUC), research report | Planned |

## Architecture

```
                     त्रिनेत्र
                        │
      ┌─────────────────┼─────────────────┐
      ↓                 ↓                 ↓
 Subscriber          Device            Behaviour
 Intelligence      Intelligence       Intelligence
      │                 │                 │
      └─────────────────┼─────────────────┘
                         ↓
                Fraud Intelligence
                         ↓
    Rule Engine + ML Anomaly Layer + Data Entry
                         ↓
              SQLite Database (trinetra.db)
                         ↓
              Rust / Axum REST API (port 3000)
                         ↓
       Vanilla JS Investigation & Entry Platform
```

A Python generator seeds a portable SQLite database with realistic benign and fraudulent subscriber traces across 8 distinct fraud scenarios. A Rust (Axum + SQLx) backend serves this data through REST API endpoints, processes rule-based + ML risk evaluations, handles entity write pipelines with audit logging, and auto-opens investigations for high risk assessments. A single-page web dashboard connects to the API and provides a full investigation and operational platform.

## Directory Structure

| Path | Description |
|---|---|
| `data/` | Database migration scripts and the canonical portable database file `trinetra.db` |
| `data-generator/` | Python simulator generating benign traces and 8 distinct fraud scenarios |
| `ml/` | Machine learning feature extractor (`features.py`), model training (`train.py`), evaluator (`score_evaluator.py`), and model artifacts |
| `backend/` | Rust Axum web API using SQLx for parameterized queries, write endpoints, ML routes, and risk engine |
| `frontend/` | Vanilla JS single-page investigation & data entry dashboard (no build step; open `index.html` directly) |
| `log/` | Iteration walkthroughs and implementation documentation ([iter1.md](log/iter1.md), [iter2.md](log/iter2.md), [iter3.md](log/iter3.md), [iter4.md](log/iter4.md)) |
| `setup.bat` | Automated one-click setup script for Windows environments |
| `Dockerfile` & `docker-compose.yml` | Multi-stage Docker containerization for cross-platform deployment |
| `dataset/` | Public FraudZen bypass-fraud CDR trace data for external ML experiments |
| `private/` | Project requirements, agent instruction manuals, and design guidelines |

## Quickstart

### Option A: Windows One-Click Setup

For Windows users, run the automated setup batch file:

```cmd
setup.bat
```

This script automatically verifies Python & Rust, installs requirements, seeds `trinetra.db`, trains the ML models, and builds the Rust backend binary.

---

### Option B: Cross-Platform Setup via Docker

Run Trinetra on Linux, macOS, or Windows using Docker Compose:

```bash
docker-compose up --build
```

- **Frontend Dashboard**: Open `http://localhost:8080` in your browser.
- **Backend API**: Running at `http://localhost:3000`.

---

### Option C: Manual Local Setup

#### 1. Install Python requirements & seed database

```bash
pip install -r requirements.txt
python data-generator/generator.py --clean
python ml/train.py
```

#### 2. Build and run the Rust backend

```bash
cd backend
cargo run
```

The API starts on `http://127.0.0.1:3000`.

#### 3. Open the dashboard

Open `frontend/index.html` in any modern browser. The dashboard connects to the backend at `http://127.0.0.1:3000` and shows a live backend health indicator in the sidebar. No build step or package install required.

## API Reference

### Subscribers & Risk Assessment

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/subscribers` | List subscribers (paginated, supports `?q=` search) |
| `POST` | `/api/subscribers` | **Register new subscriber** (`201 Created`) |
| `GET` | `/api/subscribers/:id` | Full profile: active SIMs, device history, recent CDR events, risk assessment history |
| `POST` | `/api/subscribers/:id/sims` | **Add SIM card to subscriber** (`201 Created` / `409 Conflict`) |
| `POST` | `/api/subscribers/:id/evaluate` | Run rule engine; auto-generates investigation if score is HIGH or VERY HIGH |

### Devices

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/devices` | List device entities (paginated, supports `?q=` search) |
| `POST` | `/api/devices` | **Register new device profile** (`201 Created` / `409 Conflict` on duplicate IMEI) |
| `GET` | `/api/devices/:id` | Device profile with associated SIMs and recent events |
| `PUT` | `/api/devices/:id/status` | **Update device status** (`NORMAL` / `STOLEN` / `LOST`) |

### Fraud Reports, CDR Events & Auxiliary

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/fraud_reports` | **File official fraud report** (`201 Created`) |
| `GET` | `/api/fraud_reports` | View all filed fraud reports |
| `POST` | `/api/network_events` | **Log manual CDR network event** (`201 Created`) |
| `POST` | `/api/pos` | **Register new Point of Sale** (`201 Created`) |
| `GET` | `/api/pos` | List PoS locations for dropdowns |
| `GET` | `/api/locations` | List geographic locations for CDR dropdowns |

### Investigations & Audit Logs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/investigations` | List active fraud investigations |
| `PUT` | `/api/investigations/:id` | Update status (`PENDING` → `UNDER_REVIEW` → `RESOLVED`) and investigator notes |
| `GET` | `/api/audit_logs` | Fetch the full system audit trail |

## Risk Engine

Every subscriber evaluation runs through six weighted rules:

| Rule | Trigger | Weight |
|---|---|---|
| SIM Concentration | Subscriber owns more than 9 SIM cards | +30 |
| Device Sharing | An IMEI is shared across more than 5 distinct SIMs | +25 |
| Stolen Device | SIM active on a blacklisted IMEI | +40 |
| Fraud Reports | External complaint count | +15 per report, capped at +40 |
| Suspicious PoS | Registration dealer has a fraud report rate above 30% | +15 |
| Geographic Anomaly | Consecutive signaling events in different states within 1 hour | +20 |

Scores map to categorical risk levels:

| Score | Level | Behavior |
|---|---|---|
| 0–24 | LOW | — |
| 25–49 | MEDIUM | — |
| 50–74 | HIGH | Auto-opens investigation |
| 75–100 | VERY HIGH | Auto-opens investigation |

## Investigation Dashboard & Data Entry

The `frontend/` directory contains a zero-dependency SPA built with plain HTML, CSS, and JavaScript implementing the IBM Carbon Design System.

**Dashboard pages & features:**

| Page / Component | Key Features |
|---|---|
| **Dashboard** | Overview KPIs, Risk Breakdown, Quick Risk Evaluate, and **Bulk Evaluate Queue** (progress bar + rolling terminal log) |
| **Subscribers** | Paginated table with inline **KYC & State column filters**, search bar, and "⊕ Register Subscriber" button |
| **Subscriber Detail** | Metadata profile, **Risk Score Trend Sparkline** (Canvas API), "+ Add SIM" inline form, "+ Log CDR Event" inline form, "⚠ File Fraud Report" button |
| **Devices** | Paginated device registry with inline **Status filter**, "⊕ Register Device" button, and row-level **"Mark Stolen" / "Mark Recovered"** action buttons |
| **Data Entry Side Panel** | 480px slide-in side panel (`#side-panel`) with Carbon tabs for *Subscriber*, *Device*, *Fraud Report*, and *Point of Sale* |
| **Investigations** | Status tabs (`ALL` / `PENDING` / `UNDER_REVIEW` / `RESOLVED`), risk score bars, modal dialog to assign investigators & notes |
| **Audit Log** | Chronological audit trail recording all user write actions with `user = 'operator'` and details |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `/` | Focus search bar on active page |
| `Esc` | Close side panel, close modal, or go back to Subscribers list |
| `Alt+D` | Quick navigate to Dashboard |
| `Alt+S` | Quick navigate to Subscribers |
| `Alt+V` | Quick navigate to Devices |
| `Alt+I` | Quick navigate to Investigations |
| `Alt+A` | Quick navigate to Audit Log |

## Roadmap

Trinetra is developed in phases:

- [x] **Phase 1 — Foundation & Detection**: Database schema, synthetic generator, Rust backend, 6-rule risk engine
- [x] **Iteration 2 — Carbon UI SPA**: SPA dashboard, subscriber/device browser, investigation modal, audit log
- [x] **Iteration 3 — Manual Data Entry & UI Enhancements**: 10 new API endpoints, slide-in side panel, sparkline trend chart, bulk evaluation queue, table column filters, keyboard shortcuts
- [x] **Phase 2 — Machine Learning Intelligence (Iteration 4)**: 11-feature vector extractor, Isolation Forest & Random Forest models, hybrid risk scoring engine ($0.7 \text{Rule} + 0.3 \text{ML}$), `/api/ml/train`, `/api/ml/status`, and UI ML Cards
- [ ] **Phase 3 — Graph Intelligence**: NetworkX entity graph, cluster detection across shared IMEIs and PoS networks
- [ ] **Phase 5 — Research & Evaluation**: Precision/Recall/ROC-AUC benchmarking report

## License

Released under the [MIT License](LICENSE).
