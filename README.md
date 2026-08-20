<div align="center">

![Trinetra banner](./assets/banner.png)

# त्रिनेत्र · Trinetra

**A multi-layer telecom fraud intelligence and risk detection platform**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Backend](https://img.shields.io/badge/backend-Rust%20%2F%20Axum-orange)](backend)
[![Data Generator](https://img.shields.io/badge/data--generator-Python-blue)](data-generator)
[![Database](https://img.shields.io/badge/database-SQLite-lightgrey)](data)
[![Phase](https://img.shields.io/badge/phase-1%20of%205%20complete-brightgreen)]()

</div>

---

Trinetra is an independent research prototype exploring multi-layer telecom fraud detection and explainable risk scoring. It correlates subscriber, SIM, device, and behavioral signals over synthetic telecom network traces to identify anomalies and flag investigations, every score comes with a breakdown of exactly which rules produced it.

The project is scoped in phases. **Phase 1 is complete and functional today.** Everything below Phase 1 is planned, not yet built. See [`AGENTS.md`](AGENTS.md) for the full project specification.

## Table of Contents

- [Why Trinetra](#why-trinetra)
- [Project Status](#project-status)
- [Architecture (Phase 1)](#architecture-phase-1)
- [Directory Structure](#directory-structure)
- [Quickstart](#quickstart)
- [API Reference](#api-reference)
- [Risk Engine (Phase 1)](#risk-engine-phase-1)
- [Roadmap](#roadmap)
- [License](#license)

## Why Trinetra

Most fraud detection systems produce a score with no explanation attached. Trinetra is built around the opposite premise: every risk score should be traceable to specific, auditable rules, and every flagged subscriber should generate an investigation record with a clear, human-readable reason. That principle holds across every planned phase, from the current rule engine through the future ML and graph layers.

## Project Status

| Phase | Scope | Status |
|---|---|---|
| **Phase 1 — Foundation & Detection** | Data model, synthetic data generator, SQLite database, migrations, REST API, rule-based risk engine, explainable scoring | **Complete** |
| Phase 2 — Machine Learning | Feature engineering, anomaly detection (Isolation Forest, Random Forest, XGBoost) as an additional intelligence layer | Planned |
| Phase 3 — Graph Intelligence | Entity relationship graph (NetworkX), cluster detection across subscribers/SIMs/devices | Planned |
| Phase 4 — Investigation Platform | React dashboard, graph visualization, evidence timeline, investigator workflow | Planned |
| Phase 5 — Research | Ablation studies, benchmarking, formal evaluation (precision/recall/F1/ROC-AUC), research report | Planned |

## Architecture (Phase 1)

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
                 Rule-Based Risk Engine
                         ↓
              SQLite Database (trinetra.db)
```

A Python generator seeds a portable SQLite database with realistic benign and fraudulent subscriber traces across 8 distinct fraud scenarios. A Rust (Axum + SQLx) backend serves this data through a REST API and runs the rule-based risk engine on demand, auto-opening investigations for anything scoring HIGH or above.

Graph correlation and ML scoring (shown in the full architecture in `AGENTS.md`) are Phase 2/3 additions, not part of the current pipeline.

## Directory Structure

| Path | Description |
|---|---|
| `data/` | Database migration scripts and the canonical portable database file `trinetra.db` |
| `data-generator/` | Python simulator generating benign traces and 8 distinct fraud scenarios |
| `backend/` | Rust Axum web API using SQLx for parameterized queries and the risk evaluation engine |
| `dataset/` | Public FraudZen bypass-fraud CDR trace data for external ML experiments |
| `private/` | Project requirements, agent instruction manuals, and design guidelines |

## Quickstart

### 1. Generate and populate the database

The generator runs migrations and seeds `data/trinetra.db` with 500+ subscribers across 8 fraud scenarios, plus locations, points of sale, SIMs, devices, and network events.

```bash
# from repository root
python data-generator/generator.py --clean
```

### 2. Build and run the backend

```bash
cd backend
cargo run
```

The API starts on `http://127.0.0.1:3000`.

## API Reference

### Subscribers & Risk Assessment

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/subscribers` | List subscribers (paginated, supports `?q=` search) |
| `GET` | `/api/subscribers/:id` | Full profile: active SIMs, device history, recent events, risk assessment history |
| `POST` | `/api/subscribers/:id/evaluate` | Run the rule engine on a subscriber; auto-generates an investigation if score is HIGH or VERY HIGH |

### Devices

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/devices` | List device entities |
| `GET` | `/api/devices/:id` | Device profile with every SIM ever loaded and recent events |

### Investigations & Audit

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/investigations` | List active fraud investigations |
| `PUT` | `/api/investigations/:id` | Update status (`PENDING` → `UNDER_REVIEW` → `RESOLVED`) and investigator notes |
| `GET` | `/api/audit_logs` | Fetch the system audit trail |

## Risk Engine (Phase 1)

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
| 0-24 | LOW | — |
| 25-49 | MEDIUM | — |
| 50-74 | HIGH | Auto-opens investigation |
| 75-100 | VERY HIGH | Auto-opens investigation |

In Phase 2/3, ML anomaly scores and graph cluster indicators will feed into this same risk engine alongside the existing rules, without changing the explainability contract, every contributing factor to a score will still be individually listed.

## Roadmap

Trinetra is developed in phases, from foundational detection through a full investigation platform and formal research evaluation. See [`AGENTS.md`](AGENTS.md) for the complete specification, including non-goals, data/privacy requirements, the full technology stack, and the research questions driving later phases.

Contributions and issue reports are welcome while the project is under development.

## License

Released under the [MIT License](LICENSE).
