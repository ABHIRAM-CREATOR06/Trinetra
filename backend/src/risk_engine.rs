use sqlx::{SqlitePool, Row};
use serde::{Serialize, Deserialize};
use std::time::SystemTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAssessment {
    pub assessment_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub risk_score: i32,
    pub risk_level: String,
    pub rules_triggered: Vec<String>,
    pub ml_score: Option<f64>,
    pub graph_score: Option<f64>,
    pub explanation: String,
    pub timestamp: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Investigation {
    pub investigation_id: String,
    pub assessment_id: String,
    pub investigator_id: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn evaluate_subscriber_risk(
    db: &SqlitePool,
    subscriber_id: &str,
) -> Result<RiskAssessment, sqlx::Error> {
    let mut score = 0;
    let mut triggers = Vec::new();
    let mut explanation_parts = Vec::new();

    // 1. Check Subscriber existence and metadata
    let sub_exists = sqlx::query("SELECT 1 FROM subscribers WHERE subscriber_id = ?")
        .bind(subscriber_id)
        .fetch_optional(db)
        .await?;

    if sub_exists.is_none() {
        return Err(sqlx::Error::RowNotFound);
    }

    // 2. Rule: SIM Concentration
    let sim_count: i32 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sims WHERE subscriber_id = ?;"
    )
    .bind(subscriber_id)
    .fetch_one(db)
    .await?;

    if sim_count > 9 {
        score += 30;
        triggers.push("SIM_CONCENTRATION".to_string());
        explanation_parts.push(format!("+30 High SIM concentration ({} SIMs owned; limit is 9)", sim_count));
    }

    // 3. Rule: Device Sharing (SIMBox detection helper)
    // Find if any device associated with subscriber's SIMs is shared with > 5 distinct SIMs
    let shared_device_rows = sqlx::query(
        "SELECT DISTINCT sde.device_id, COUNT(DISTINCT sde.sim_id) as sim_count \
         FROM sim_device_events sde \
         WHERE sde.sim_id IN (SELECT sim_id FROM sims WHERE subscriber_id = ?) \
         GROUP BY sde.device_id;"
    )
    .bind(subscriber_id)
    .fetch_all(db)
    .await?;

    let mut max_shared_sims = 0;
    for row in &shared_device_rows {
        let count: i32 = row.try_get("sim_count")?;
        if count > max_shared_sims {
            max_shared_sims = count;
        }
    }

    if max_shared_sims > 5 {
        score += 25;
        triggers.push("DEVICE_SHARING".to_string());
        explanation_parts.push(format!("+25 Device sharing (Associated device is used by {} distinct SIMs)", max_shared_sims));
    }

    // 4. Rule: Stolen Device Reuse
    let stolen_device_count: i32 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM devices d \
         WHERE d.status = 'STOLEN' AND d.device_id IN ( \
             SELECT DISTINCT device_id FROM sim_device_events \
             WHERE sim_id IN (SELECT sim_id FROM sims WHERE subscriber_id = ?) \
         );"
    )
    .bind(subscriber_id)
    .fetch_one(db)
    .await?;

    if stolen_device_count > 0 {
        score += 40;
        triggers.push("STOLEN_DEVICE".to_string());
        explanation_parts.push("+40 Stolen device reuse (Associated device IMEI is marked as STOLEN/LOST)".to_string());
    }

    // 5. Rule: Fraud Reports
    let report_count: i32 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM fraud_reports fr \
         WHERE fr.mobile_number IN (SELECT mobile_number FROM sims WHERE subscriber_id = ?);"
    )
    .bind(subscriber_id)
    .fetch_one(db)
    .await?;

    if report_count > 0 {
        let points = (report_count * 15).min(40);
        score += points;
        triggers.push("FRAUD_REPORTS".to_string());
        explanation_parts.push(format!("+{} Fraud reports ({} report(s) filed against associated mobile number(s))", points, report_count));
    }

    // 6. Rule: Suspicious PoS
    let pos_row = sqlx::query(
        "SELECT pos_id FROM subscribers WHERE subscriber_id = ?;"
    )
    .bind(subscriber_id)
    .fetch_optional(db)
    .await?;

    if let Some(row) = pos_row {
        let pos_id: String = row.try_get("pos_id")?;
        
        let activations: i32 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM activation_events WHERE pos_id = ?;"
        )
        .bind(&pos_id)
        .fetch_one(db)
        .await?;

        if activations > 5 {
            let reported_activations: i32 = sqlx::query_scalar(
                "SELECT COUNT(DISTINCT ae.sim_id) \
                 FROM activation_events ae \
                 JOIN sims s ON ae.sim_id = s.sim_id \
                 JOIN fraud_reports fr ON s.mobile_number = fr.mobile_number \
                 WHERE ae.pos_id = ?;"
            )
            .bind(&pos_id)
            .fetch_one(db)
            .await?;

            let ratio = (reported_activations as f64) / (activations as f64);
            if ratio > 0.3 {
                score += 15;
                triggers.push("SUSPICIOUS_POS".to_string());
                explanation_parts.push(format!("+15 Suspicious Point of Sale (Registration PoS {} has a {:.1}% fraud report rate)", pos_id, ratio * 100.0));
            }
        }
    }

    // 7. Rule: Geographic Anomaly (Impossible travel Delhi -> Bangalore/etc)
    struct NetEvent {
        timestamp: String,
        state: String,
    }

    let net_events_rows = sqlx::query(
        "SELECT ne.timestamp, l.state \
         FROM network_events ne \
         JOIN locations l ON ne.location_id = l.location_id \
         WHERE ne.mobile_number IN (SELECT mobile_number FROM sims WHERE subscriber_id = ?) \
         ORDER BY ne.timestamp ASC;"
    )
    .bind(subscriber_id)
    .fetch_all(db)
    .await?;

    let mut events = Vec::new();
    for r in net_events_rows {
        events.push(NetEvent {
            timestamp: r.try_get("timestamp")?,
            state: r.try_get("state")?,
        });
    }

    let mut geo_anomaly = false;
    for i in 0..events.len().saturating_sub(1) {
        let e1 = &events[i];
        let e2 = &events[i+1];
        if e1.state != e2.state {
            // Parse timestamps (format: YYYY-MM-DDTHH:MM:SS or simple text from generator)
            // Note: our synthetic generator outputs standard ISO8601 strings
            if let (Ok(t1), Ok(t2)) = (datetime_from_iso(&e1.timestamp), datetime_from_iso(&e2.timestamp)) {
                let diff = t2.signed_duration_since(t1).num_seconds().abs();
                if diff < 3600 { // less than 1 hour between different states
                    geo_anomaly = true;
                    explanation_parts.push(format!("+20 Geographic Anomaly (Impossible travel between {} and {} within {} min)", e1.state, e2.state, diff / 60));
                    break;
                }
            }
        }
    }

    if geo_anomaly {
        score += 20;
        triggers.push("GEOGRAPHIC_ANOMALY".to_string());
    }

    // Cap the score
    score = score.min(100);

    // Determine level
    let risk_level = match score {
        0..=24 => "LOW",
        25..=49 => "MEDIUM",
        50..=74 => "HIGH",
        _ => "VERY HIGH",
    };

    let explanation = if explanation_parts.is_empty() {
        "No anomalous indicators triggered.".to_string()
    } else {
        explanation_parts.join("\n")
    };

    let assessment_id = format!("ASMT_{}", Uuid::new_v4().to_string()[..8].to_uppercase());
    let timestamp = datetime_now_iso();

    let rules_json = serde_json::to_string(&triggers).unwrap_or_else(|_| "[]".to_string());

    // 8. Save Risk Assessment
    sqlx::query(
        "INSERT INTO risk_assessments (assessment_id, entity_type, entity_id, risk_score, risk_level, rules_triggered, ml_score, graph_score, explanation, timestamp) \
         VALUES (?, 'subscriber', ?, ?, ?, ?, NULL, NULL, ?, ?);"
    )
    .bind(&assessment_id)
    .bind(subscriber_id)
    .bind(score)
    .bind(risk_level)
    .bind(&rules_json)
    .bind(&explanation)
    .bind(&timestamp)
    .execute(db)
    .await?;

    // 9. Auto-create investigation for HIGH / VERY HIGH
    if risk_level == "HIGH" || risk_level == "VERY HIGH" {
        let inv_id = format!("INV_{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        sqlx::query(
            "INSERT INTO investigations (investigation_id, assessment_id, investigator_id, status, notes, created_at, updated_at) \
             VALUES (?, ?, NULL, 'PENDING', 'Auto-created due to high risk assessment score.', ?, ?);"
        )
        .bind(&inv_id)
        .bind(&assessment_id)
        .bind(&timestamp)
        .bind(&timestamp)
        .execute(db)
        .await?;
    }

    // 10. Audit Log
    let audit_id = format!("AUD_{}", Uuid::new_v4().to_string()[..8].to_uppercase());
    let audit_details = format!("Evaluated subscriber {}, score: {}, level: {}", subscriber_id, score, risk_level);
    sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) \
         VALUES (?, 'EVALUATE_SUBSCRIBER', 'system', ?, ?);"
    )
    .bind(&audit_id)
    .bind(&audit_details)
    .bind(&timestamp)
    .execute(db)
    .await?;

    Ok(RiskAssessment {
        assessment_id,
        entity_type: "subscriber".to_string(),
        entity_id: subscriber_id.to_string(),
        risk_score: score,
        risk_level: risk_level.to_string(),
        rules_triggered: triggers,
        ml_score: None,
        graph_score: None,
        explanation,
        timestamp,
    })
}

// Simple parser for generator ISO strings (handles YYYY-MM-DDTHH:MM:SS or simple variants)
fn datetime_from_iso(s: &str) -> Result<chrono::NaiveDateTime, chrono::ParseError> {
    // try standard ISO8601
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return Ok(dt);
    }
    // try with fractional seconds
    if s.len() > 19 {
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s[..19], "%Y-%m-%dT%H:%M:%S") {
            return Ok(dt);
        }
    }
    chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S")
}

fn datetime_now_iso() -> String {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    // Convert to string formatted as ISO8601 using chrono
    let naive = chrono::DateTime::from_timestamp(now as i64, 0)
        .map(|dt| dt.naive_utc())
        .unwrap_or_default();
    naive.format("%Y-%m-%dT%H:%M:%S").to_string()
}
