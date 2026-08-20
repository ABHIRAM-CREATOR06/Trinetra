-- Migration: 002_risk_engine.sql
-- Create risk engine, investigations, and audit tables

-- 1. Risk Assessments
CREATE TABLE IF NOT EXISTS risk_assessments (
    assessment_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL, -- 'subscriber', 'device', 'sim'
    entity_id TEXT NOT NULL,
    risk_score INTEGER NOT NULL,
    risk_level TEXT NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'VERY HIGH'
    rules_triggered TEXT NOT NULL, -- JSON string representation
    ml_score REAL,
    graph_score REAL,
    explanation TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

-- 2. Investigations
CREATE TABLE IF NOT EXISTS investigations (
    investigation_id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL,
    investigator_id TEXT,
    status TEXT NOT NULL, -- 'PENDING', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED'
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (assessment_id) REFERENCES risk_assessments(assessment_id)
);

-- 3. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    user TEXT NOT NULL,
    details TEXT NOT NULL,
    timestamp TEXT NOT NULL
);
