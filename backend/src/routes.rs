use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
use serde_json::Value;

use crate::risk_engine::{self, RiskAssessment};

// Shared state struct
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
}

// ------------------ REQUEST/RESPONSE STRUCTS ------------------

#[derive(Deserialize)]
pub struct PaginationQuery {
    q: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Serialize)]
pub struct SubscriberListItem {
    subscriber_id: String,
    kyc_status: String,
    registration_date: String,
    state: String,
    district: String,
    pos_id: String,
    sim_count: i64,
}

#[derive(Serialize)]
pub struct SubscriberProfile {
    subscriber_id: String,
    kyc_status: String,
    registration_date: String,
    state: String,
    district: String,
    pos_id: String,
    sims: Vec<Value>,
    recent_devices: Vec<Value>,
    recent_events: Vec<Value>,
    recent_assessments: Vec<RiskAssessment>,
}

#[derive(Serialize)]
pub struct DeviceListItem {
    device_id: String,
    imei: String,
    tac: String,
    device_model: String,
    manufacturer: String,
    status: String,
    first_seen: String,
    last_seen: String,
}

#[derive(Serialize)]
pub struct DeviceProfile {
    device_id: String,
    imei: String,
    tac: String,
    device_model: String,
    manufacturer: String,
    status: String,
    first_seen: String,
    last_seen: String,
    associated_sims: Vec<Value>,
    recent_events: Vec<Value>,
}

#[derive(Serialize)]
pub struct InvestigationItem {
    investigation_id: String,
    assessment_id: String,
    subscriber_id: String,
    risk_score: i32,
    risk_level: String,
    rules_triggered: Value,
    investigator_id: Option<String>,
    status: String,
    notes: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
pub struct UpdateInvestigationRequest {
    status: Option<String>,
    notes: Option<String>,
    investigator_id: Option<String>,
}

// ------------------ ROUTE HANDLERS ------------------

// GET /
pub async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "त्रिनेत्र (Trinetra) Backend",
        "version": "0.1.0",
        "endpoints": [
            "GET  /api/subscribers",
            "GET  /api/subscribers/:id",
            "POST /api/subscribers/:id/evaluate",
            "GET  /api/devices",
            "GET  /api/devices/:id",
            "GET  /api/investigations",
            "PUT  /api/investigations/:id",
            "GET  /api/audit_logs"
        ]
    }))
}

// GET /api/subscribers
pub async fn list_subscribers(
    State(state): State<AppState>,
    Query(query): Query<PaginationQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);
    
    let search = query.q.unwrap_or_default();
    let query_str = if !search.is_empty() {
        format!("%{}%", search)
    } else {
        "%".to_string()
    };

    let sql = "SELECT s.subscriber_id, s.kyc_status, s.registration_date, s.state, s.district, s.pos_id, \
               (SELECT COUNT(*) FROM sims WHERE subscriber_id = s.subscriber_id) as sim_count \
               FROM subscribers s \
               WHERE s.subscriber_id LIKE ? OR s.state LIKE ? OR s.kyc_status LIKE ? \
               ORDER BY s.registration_date DESC \
               LIMIT ? OFFSET ?;";

    let rows = match sqlx::query(sql)
        .bind(&query_str)
        .bind(&query_str)
        .bind(&query_str)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut list = Vec::new();
    for row in rows {
        list.push(SubscriberListItem {
            subscriber_id: row.get("subscriber_id"),
            kyc_status: row.get("kyc_status"),
            registration_date: row.get("registration_date"),
            state: row.get("state"),
            district: row.get("district"),
            pos_id: row.get("pos_id"),
            sim_count: row.get("sim_count"),
        });
    }

    Json(list).into_response()
}

// GET /api/subscribers/:id
pub async fn get_subscriber(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    // 1. Fetch main subscriber record
    let sub_row = match sqlx::query("SELECT * FROM subscribers WHERE subscriber_id = ?;")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::NOT_FOUND, "Subscriber not found").into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // 2. Fetch associated SIMs
    let sim_rows = match sqlx::query("SELECT * FROM sims WHERE subscriber_id = ?;")
        .bind(&id)
        .fetch_all(&state.db)
        .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let mut sims = Vec::new();
    for row in sim_rows {
        sims.push(serde_json::json!({
            "sim_id": row.get::<String, _>("sim_id"),
            "mobile_number": row.get::<String, _>("mobile_number"),
            "activation_date": row.get::<String, _>("activation_date"),
            "deactivation_date": row.get::<Option<String>, _>("deactivation_date"),
            "operator": row.get::<String, _>("operator"),
            "status": row.get::<String, _>("status")
        }));
    }

    // 3. Fetch recent devices seen on subscriber's SIMs
    let dev_rows = match sqlx::query(
        "SELECT DISTINCT d.* FROM devices d \
         JOIN sim_device_events sde ON d.device_id = sde.device_id \
         WHERE sde.sim_id IN (SELECT sim_id FROM sims WHERE subscriber_id = ?) \
         ORDER BY sde.timestamp DESC LIMIT 10;"
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let mut recent_devices = Vec::new();
    for row in dev_rows {
        recent_devices.push(serde_json::json!({
            "device_id": row.get::<String, _>("device_id"),
            "imei": row.get::<String, _>("imei"),
            "device_model": row.get::<String, _>("device_model"),
            "manufacturer": row.get::<String, _>("manufacturer"),
            "status": row.get::<String, _>("status")
        }));
    }

    // 4. Fetch recent network CDR events for subscriber SIMs
    let evt_rows = match sqlx::query(
        "SELECT ne.*, l.state, l.district FROM network_events ne \
         JOIN locations l ON ne.location_id = l.location_id \
         WHERE ne.mobile_number IN (SELECT mobile_number FROM sims WHERE subscriber_id = ?) \
         ORDER BY ne.timestamp DESC LIMIT 30;"
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let mut recent_events = Vec::new();
    for row in evt_rows {
        recent_events.push(serde_json::json!({
            "event_id": row.get::<String, _>("event_id"),
            "timestamp": row.get::<String, _>("timestamp"),
            "mobile_number": row.get::<String, _>("mobile_number"),
            "device_id": row.get::<String, _>("device_id"),
            "location_id": row.get::<String, _>("location_id"),
            "event_type": row.get::<String, _>("event_type"),
            "state": row.get::<String, _>("state"),
            "district": row.get::<String, _>("district")
        }));
    }

    // 5. Fetch recent risk assessments
    let asmt_rows = match sqlx::query(
        "SELECT * FROM risk_assessments \
         WHERE entity_type = 'subscriber' AND entity_id = ? \
         ORDER BY timestamp DESC LIMIT 5;"
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let mut recent_assessments = Vec::new();
    for row in asmt_rows {
        let rules_str: String = row.get("rules_triggered");
        let rules: Vec<String> = serde_json::from_str(&rules_str).unwrap_or_default();
        recent_assessments.push(RiskAssessment {
            assessment_id: row.get("assessment_id"),
            entity_type: row.get("entity_type"),
            entity_id: row.get("entity_id"),
            risk_score: row.get("risk_score"),
            risk_level: row.get("risk_level"),
            rules_triggered: rules,
            ml_score: None,
            graph_score: None,
            explanation: row.get("explanation"),
            timestamp: row.get("timestamp"),
        });
    }

    let profile = SubscriberProfile {
        subscriber_id: sub_row.get("subscriber_id"),
        kyc_status: sub_row.get("kyc_status"),
        registration_date: sub_row.get("registration_date"),
        state: sub_row.get("state"),
        district: sub_row.get("district"),
        pos_id: sub_row.get("pos_id"),
        sims,
        recent_devices,
        recent_events,
        recent_assessments,
    };

    Json(profile).into_response()
}

// POST /api/subscribers/:id/evaluate
pub async fn evaluate_subscriber(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match risk_engine::evaluate_subscriber_risk(&state.db, &id).await {
        Ok(assessment) => Json(assessment).into_response(),
        Err(sqlx::Error::RowNotFound) => (StatusCode::NOT_FOUND, "Subscriber not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// GET /api/devices
pub async fn list_devices(
    State(state): State<AppState>,
    Query(query): Query<PaginationQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);
    
    let search = query.q.unwrap_or_default();
    let query_str = if !search.is_empty() {
        format!("%{}%", search)
    } else {
        "%".to_string()
    };

    let sql = "SELECT * FROM devices \
               WHERE device_id LIKE ? OR imei LIKE ? OR device_model LIKE ? OR manufacturer LIKE ? \
               ORDER BY last_seen DESC \
               LIMIT ? OFFSET ?;";

    let rows = match sqlx::query(sql)
        .bind(&query_str)
        .bind(&query_str)
        .bind(&query_str)
        .bind(&query_str)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut list = Vec::new();
    for row in rows {
        list.push(DeviceListItem {
            device_id: row.get("device_id"),
            imei: row.get("imei"),
            tac: row.get("tac"),
            device_model: row.get("device_model"),
            manufacturer: row.get("manufacturer"),
            status: row.get("status"),
            first_seen: row.get("first_seen"),
            last_seen: row.get("last_seen"),
        });
    }

    Json(list).into_response()
}

// GET /api/devices/:id
pub async fn get_device(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let dev_row = match sqlx::query("SELECT * FROM devices WHERE device_id = ?;")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::NOT_FOUND, "Device not found").into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // SIM cards used on this device
    let sim_rows = match sqlx::query(
        "SELECT DISTINCT s.* FROM sims s \
         JOIN sim_device_events sde ON s.sim_id = sde.sim_id \
         WHERE sde.device_id = ?;"
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let mut associated_sims = Vec::new();
    for row in sim_rows {
        associated_sims.push(serde_json::json!({
            "sim_id": row.get::<String, _>("sim_id"),
            "mobile_number": row.get::<String, _>("mobile_number"),
            "subscriber_id": row.get::<String, _>("subscriber_id"),
            "operator": row.get::<String, _>("operator"),
            "status": row.get::<String, _>("status")
        }));
    }

    // Recent network events on this device
    let evt_rows = match sqlx::query(
        "SELECT ne.*, l.state, l.district FROM network_events ne \
         JOIN locations l ON ne.location_id = l.location_id \
         WHERE ne.device_id = ? \
         ORDER BY ne.timestamp DESC LIMIT 30;"
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let mut recent_events = Vec::new();
    for row in evt_rows {
        recent_events.push(serde_json::json!({
            "event_id": row.get::<String, _>("event_id"),
            "timestamp": row.get::<String, _>("timestamp"),
            "mobile_number": row.get::<String, _>("mobile_number"),
            "event_type": row.get::<String, _>("event_type"),
            "state": row.get::<String, _>("state"),
            "district": row.get::<String, _>("district")
        }));
    }

    let profile = DeviceProfile {
        device_id: dev_row.get("device_id"),
        imei: dev_row.get("imei"),
        tac: dev_row.get("tac"),
        device_model: dev_row.get("device_model"),
        manufacturer: dev_row.get("manufacturer"),
        status: dev_row.get("status"),
        first_seen: dev_row.get("first_seen"),
        last_seen: dev_row.get("last_seen"),
        associated_sims,
        recent_events,
    };

    Json(profile).into_response()
}

// GET /api/investigations
pub async fn list_investigations(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let sql = "SELECT i.*, ra.entity_id as subscriber_id, ra.risk_score, ra.risk_level, ra.rules_triggered \
               FROM investigations i \
               JOIN risk_assessments ra ON i.assessment_id = ra.assessment_id \
               ORDER BY i.created_at DESC;";

    let rows = match sqlx::query(sql)
        .fetch_all(&state.db)
        .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut list = Vec::new();
    for row in rows {
        let rules_str: String = row.get("rules_triggered");
        let rules: Value = serde_json::from_str(&rules_str).unwrap_or_else(|_| serde_json::json!([]));
        list.push(InvestigationItem {
            investigation_id: row.get("investigation_id"),
            assessment_id: row.get("assessment_id"),
            subscriber_id: row.get("subscriber_id"),
            risk_score: row.get("risk_score"),
            risk_level: row.get("risk_level"),
            rules_triggered: rules,
            investigator_id: row.get("investigator_id"),
            status: row.get("status"),
            notes: row.get("notes"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    Json(list).into_response()
}

// PUT /api/investigations/:id
pub async fn update_investigation(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateInvestigationRequest>,
) -> impl IntoResponse {
    // Check existence
    let exists: Option<String> = match sqlx::query_scalar("SELECT status FROM investigations WHERE investigation_id = ?;")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if exists.is_none() {
        return (StatusCode::NOT_FOUND, "Investigation not found").into_response();
    }

    let timestamp = {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let naive = chrono::DateTime::from_timestamp(now as i64, 0)
            .map(|dt| dt.naive_utc())
            .unwrap_or_default();
        naive.format("%Y-%m-%dT%H:%M:%S").to_string()
    };

    // Formulate update query based on fields provided
    let mut query_builder = String::from("UPDATE investigations SET updated_at = ?");
    if payload.status.is_some() {
        query_builder.push_str(", status = ?");
    }
    if payload.notes.is_some() {
        query_builder.push_str(", notes = ?");
    }
    if payload.investigator_id.is_some() {
        query_builder.push_str(", investigator_id = ?");
    }
    query_builder.push_str(" WHERE investigation_id = ?;");

    let mut q = sqlx::query(&query_builder).bind(&timestamp);
    if let Some(status) = &payload.status {
        q = q.bind(status);
    }
    if let Some(notes) = &payload.notes {
        q = q.bind(notes);
    }
    if let Some(inv_id) = &payload.investigator_id {
        q = q.bind(inv_id);
    }
    q = q.bind(&id);

    if let Err(e) = q.execute(&state.db).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Add Audit Log
    let audit_id = format!("AUD_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let audit_details = format!("Updated investigation {}, status: {:?}, notes: {:?}", id, payload.status, payload.notes);
    let _ = sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) \
         VALUES (?, 'UPDATE_INVESTIGATION', 'investigator', ?, ?);"
    )
    .bind(&audit_id)
    .bind(&audit_details)
    .bind(&timestamp)
    .execute(&state.db)
    .await;

    (StatusCode::OK, "Investigation updated successfully").into_response()
}

// GET /api/audit_logs
pub async fn list_audit_logs(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let rows = match sqlx::query("SELECT * FROM audit_logs ORDER BY timestamp DESC;")
        .fetch_all(&state.db)
        .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut list = Vec::new();
    for row in rows {
        list.push(serde_json::json!({
            "audit_id": row.get::<String, _>("audit_id"),
            "action": row.get::<String, _>("action"),
            "user": row.get::<String, _>("user"),
            "details": row.get::<String, _>("details"),
            "timestamp": row.get::<String, _>("timestamp")
        }));
    }

    Json(list).into_response()
}
