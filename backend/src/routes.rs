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

#[derive(Deserialize)]
pub struct CreateSubscriberRequest {
    pub subscriber_id: Option<String>,
    pub kyc_status: Option<String>,
    pub state: String,
    pub district: String,
    pub pos_id: String,
}

#[derive(Deserialize)]
pub struct AddSimRequest {
    pub sim_id: Option<String>,
    pub mobile_number: String,
    pub operator: String,
    pub status: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateDeviceRequest {
    pub device_id: Option<String>,
    pub imei: String,
    pub tac: Option<String>,
    pub device_model: String,
    pub manufacturer: String,
    pub status: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateDeviceStatusRequest {
    pub status: String,
}

#[derive(Deserialize)]
pub struct FileFraudReportRequest {
    pub mobile_number: String,
    pub report_type: String,
    pub severity: String,
    pub source: String,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct LogNetworkEventRequest {
    pub mobile_number: String,
    pub device_id: String,
    pub location_id: String,
    pub event_type: String,
}

#[derive(Deserialize)]
pub struct CreatePosRequest {
    pub pos_id: Option<String>,
    pub region: String,
    pub operator: String,
    pub registration_date: Option<String>,
}

fn current_iso_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let naive = chrono::DateTime::from_timestamp(now as i64, 0)
        .map(|dt| dt.naive_utc())
        .unwrap_or_default();
    naive.format("%Y-%m-%dT%H:%M:%S").to_string()
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
            "POST /api/subscribers",
            "GET  /api/subscribers/:id",
            "POST /api/subscribers/:id/sims",
            "POST /api/subscribers/:id/evaluate",
            "GET  /api/devices",
            "POST /api/devices",
            "GET  /api/devices/:id",
            "PUT  /api/devices/:id/status",
            "GET  /api/investigations",
            "PUT  /api/investigations/:id",
            "POST /api/fraud_reports",
            "GET  /api/fraud_reports",
            "POST /api/network_events",
            "POST /api/pos",
            "GET  /api/pos",
            "GET  /api/locations",
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

// POST /api/subscribers
pub async fn create_subscriber(
    State(state): State<AppState>,
    Json(payload): Json<CreateSubscriberRequest>,
) -> impl IntoResponse {
    if payload.state.trim().is_empty() || payload.district.trim().is_empty() || payload.pos_id.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "state, district, and pos_id are required").into_response();
    }

    let pos_exists: Option<i32> = match sqlx::query_scalar("SELECT 1 FROM point_of_sales WHERE pos_id = ?;")
        .bind(&payload.pos_id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(res) => res,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if pos_exists.is_none() {
        return (StatusCode::BAD_REQUEST, "Specified pos_id does not exist").into_response();
    }

    let sub_id = payload.subscriber_id.unwrap_or_else(|| {
        format!("SUB_MANUAL_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase())
    });
    let kyc = payload.kyc_status.unwrap_or_else(|| "PENDING".to_string());
    let reg_date = current_iso_timestamp();

    if let Err(e) = sqlx::query(
        "INSERT INTO subscribers (subscriber_id, kyc_status, registration_date, state, district, pos_id) \
         VALUES (?, ?, ?, ?, ?, ?);"
    )
    .bind(&sub_id)
    .bind(&kyc)
    .bind(&reg_date)
    .bind(&payload.state)
    .bind(&payload.district)
    .bind(&payload.pos_id)
    .execute(&state.db)
    .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let audit_id = format!("AUD_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let details = format!("Created subscriber {} (state: {}, pos_id: {})", sub_id, payload.state, payload.pos_id);
    let _ = sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) VALUES (?, 'CREATE_SUBSCRIBER', 'operator', ?, ?);"
    )
    .bind(&audit_id)
    .bind(&details)
    .bind(&reg_date)
    .execute(&state.db)
    .await;

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "subscriber_id": sub_id,
            "kyc_status": kyc,
            "registration_date": reg_date,
            "state": payload.state,
            "district": payload.district,
            "pos_id": payload.pos_id
        })),
    ).into_response()
}

// POST /api/subscribers/:id/sims
pub async fn add_sim(
    State(state): State<AppState>,
    Path(sub_id): Path<String>,
    Json(payload): Json<AddSimRequest>,
) -> impl IntoResponse {
    if payload.mobile_number.trim().is_empty() || payload.operator.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "mobile_number and operator are required").into_response();
    }

    let sub_exists: Option<i32> = match sqlx::query_scalar("SELECT 1 FROM subscribers WHERE subscriber_id = ?;")
        .bind(&sub_id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(res) => res,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if sub_exists.is_none() {
        return (StatusCode::NOT_FOUND, "Subscriber not found").into_response();
    }

    let mob_exists: Option<i32> = match sqlx::query_scalar("SELECT 1 FROM sims WHERE mobile_number = ?;")
        .bind(&payload.mobile_number)
        .fetch_optional(&state.db)
        .await
    {
        Ok(res) => res,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if mob_exists.is_some() {
        return (StatusCode::CONFLICT, "Mobile number already exists").into_response();
    }

    let sim_id = payload.sim_id.unwrap_or_else(|| {
        format!("SIM_MANUAL_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase())
    });
    let status = payload.status.unwrap_or_else(|| "ACTIVE".to_string());
    let act_date = current_iso_timestamp();

    if let Err(e) = sqlx::query(
        "INSERT INTO sims (sim_id, mobile_number, subscriber_id, activation_date, operator, status) \
         VALUES (?, ?, ?, ?, ?, ?);"
    )
    .bind(&sim_id)
    .bind(&payload.mobile_number)
    .bind(&sub_id)
    .bind(&act_date)
    .bind(&payload.operator)
    .bind(&status)
    .execute(&state.db)
    .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let audit_id = format!("AUD_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let details = format!("Added SIM {} ({}) to subscriber {}", sim_id, payload.mobile_number, sub_id);
    let _ = sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) VALUES (?, 'ADD_SIM', 'operator', ?, ?);"
    )
    .bind(&audit_id)
    .bind(&details)
    .bind(&act_date)
    .execute(&state.db)
    .await;

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "sim_id": sim_id,
            "mobile_number": payload.mobile_number,
            "subscriber_id": sub_id,
            "activation_date": act_date,
            "operator": payload.operator,
            "status": status
        })),
    ).into_response()
}

// POST /api/devices
pub async fn create_device(
    State(state): State<AppState>,
    Json(payload): Json<CreateDeviceRequest>,
) -> impl IntoResponse {
    if payload.imei.trim().is_empty() || payload.device_model.trim().is_empty() || payload.manufacturer.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "imei, device_model, and manufacturer are required").into_response();
    }

    let imei_exists: Option<i32> = match sqlx::query_scalar("SELECT 1 FROM devices WHERE imei = ?;")
        .bind(&payload.imei)
        .fetch_optional(&state.db)
        .await
    {
        Ok(res) => res,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if imei_exists.is_some() {
        return (StatusCode::CONFLICT, "IMEI already exists").into_response();
    }

    let dev_id = payload.device_id.unwrap_or_else(|| {
        format!("DEV_MANUAL_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase())
    });
    let tac = payload.tac.unwrap_or_else(|| {
        payload.imei.chars().take(8).collect()
    });
    let status = payload.status.unwrap_or_else(|| "NORMAL".to_string());
    let now = current_iso_timestamp();

    if let Err(e) = sqlx::query(
        "INSERT INTO devices (device_id, imei, tac, device_model, manufacturer, status, first_seen, last_seen) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);"
    )
    .bind(&dev_id)
    .bind(&payload.imei)
    .bind(&tac)
    .bind(&payload.device_model)
    .bind(&payload.manufacturer)
    .bind(&status)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let audit_id = format!("AUD_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let details = format!("Registered device {} (IMEI: {}, model: {})", dev_id, payload.imei, payload.device_model);
    let _ = sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) VALUES (?, 'CREATE_DEVICE', 'operator', ?, ?);"
    )
    .bind(&audit_id)
    .bind(&details)
    .bind(&now)
    .execute(&state.db)
    .await;

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "device_id": dev_id,
            "imei": payload.imei,
            "tac": tac,
            "device_model": payload.device_model,
            "manufacturer": payload.manufacturer,
            "status": status,
            "first_seen": now,
            "last_seen": now
        })),
    ).into_response()
}

// PUT /api/devices/:id/status
pub async fn update_device_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateDeviceStatusRequest>,
) -> impl IntoResponse {
    let dev_exists: Option<i32> = match sqlx::query_scalar("SELECT 1 FROM devices WHERE device_id = ?;")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
    {
        Ok(res) => res,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if dev_exists.is_none() {
        return (StatusCode::NOT_FOUND, "Device not found").into_response();
    }

    let now = current_iso_timestamp();

    if let Err(e) = sqlx::query("UPDATE devices SET status = ?, last_seen = ? WHERE device_id = ?;")
        .bind(&payload.status)
        .bind(&now)
        .bind(&id)
        .execute(&state.db)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let audit_id = format!("AUD_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let details = format!("Updated status of device {} to {}", id, payload.status);
    let _ = sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) VALUES (?, 'UPDATE_DEVICE_STATUS', 'operator', ?, ?);"
    )
    .bind(&audit_id)
    .bind(&details)
    .bind(&now)
    .execute(&state.db)
    .await;

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "ok",
            "device_id": id,
            "new_status": payload.status
        })),
    ).into_response()
}

// POST /api/fraud_reports
pub async fn file_fraud_report(
    State(state): State<AppState>,
    Json(payload): Json<FileFraudReportRequest>,
) -> impl IntoResponse {
    if payload.mobile_number.trim().is_empty() || payload.report_type.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "mobile_number and report_type are required").into_response();
    }

    let sim_exists: Option<i32> = match sqlx::query_scalar("SELECT 1 FROM sims WHERE mobile_number = ?;")
        .bind(&payload.mobile_number)
        .fetch_optional(&state.db)
        .await
    {
        Ok(res) => res,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if sim_exists.is_none() {
        return (StatusCode::BAD_REQUEST, "Mobile number does not exist in SIM database").into_response();
    }

    let report_id = format!("RPT_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let now = current_iso_timestamp();

    if let Err(e) = sqlx::query(
        "INSERT INTO fraud_reports (report_id, mobile_number, report_type, timestamp, severity, source, description) \
         VALUES (?, ?, ?, ?, ?, ?, ?);"
    )
    .bind(&report_id)
    .bind(&payload.mobile_number)
    .bind(&payload.report_type)
    .bind(&now)
    .bind(&payload.severity)
    .bind(&payload.source)
    .bind(&payload.description)
    .execute(&state.db)
    .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let audit_id = format!("AUD_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let details = format!("Filed fraud report {} for mobile {} ({})", report_id, payload.mobile_number, payload.report_type);
    let _ = sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) VALUES (?, 'FILE_FRAUD_REPORT', 'operator', ?, ?);"
    )
    .bind(&audit_id)
    .bind(&details)
    .bind(&now)
    .execute(&state.db)
    .await;

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "report_id": report_id,
            "mobile_number": payload.mobile_number,
            "report_type": payload.report_type,
            "timestamp": now,
            "severity": payload.severity,
            "source": payload.source,
            "description": payload.description
        })),
    ).into_response()
}

// POST /api/network_events
pub async fn log_network_event(
    State(state): State<AppState>,
    Json(payload): Json<LogNetworkEventRequest>,
) -> impl IntoResponse {
    if payload.mobile_number.trim().is_empty() || payload.device_id.trim().is_empty() || payload.location_id.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "mobile_number, device_id, and location_id are required").into_response();
    }

    let sim_exists: Option<i32> = match sqlx::query_scalar("SELECT 1 FROM sims WHERE mobile_number = ?;")
        .bind(&payload.mobile_number)
        .fetch_optional(&state.db)
        .await { Ok(r) => r, Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response() };
    if sim_exists.is_none() {
        return (StatusCode::BAD_REQUEST, "Mobile number not found in SIM database").into_response();
    }

    let dev_exists: Option<i32> = match sqlx::query_scalar("SELECT 1 FROM devices WHERE device_id = ?;")
        .bind(&payload.device_id)
        .fetch_optional(&state.db)
        .await { Ok(r) => r, Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response() };
    if dev_exists.is_none() {
        return (StatusCode::BAD_REQUEST, "Device ID not found").into_response();
    }

    let loc_exists: Option<i32> = match sqlx::query_scalar("SELECT 1 FROM locations WHERE location_id = ?;")
        .bind(&payload.location_id)
        .fetch_optional(&state.db)
        .await { Ok(r) => r, Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response() };
    if loc_exists.is_none() {
        return (StatusCode::BAD_REQUEST, "Location ID not found").into_response();
    }

    let event_id = format!("EVT_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let now = current_iso_timestamp();

    if let Err(e) = sqlx::query(
        "INSERT INTO network_events (event_id, timestamp, mobile_number, device_id, location_id, event_type) \
         VALUES (?, ?, ?, ?, ?, ?);"
    )
    .bind(&event_id)
    .bind(&now)
    .bind(&payload.mobile_number)
    .bind(&payload.device_id)
    .bind(&payload.location_id)
    .bind(&payload.event_type)
    .execute(&state.db)
    .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let audit_id = format!("AUD_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let details = format!("Logged network event {} for mobile {} ({})", event_id, payload.mobile_number, payload.event_type);
    let _ = sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) VALUES (?, 'LOG_NETWORK_EVENT', 'operator', ?, ?);"
    )
    .bind(&audit_id)
    .bind(&details)
    .bind(&now)
    .execute(&state.db)
    .await;

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "event_id": event_id,
            "timestamp": now,
            "mobile_number": payload.mobile_number,
            "device_id": payload.device_id,
            "location_id": payload.location_id,
            "event_type": payload.event_type
        })),
    ).into_response()
}

// POST /api/pos
pub async fn create_pos(
    State(state): State<AppState>,
    Json(payload): Json<CreatePosRequest>,
) -> impl IntoResponse {
    if payload.region.trim().is_empty() || payload.operator.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "region and operator are required").into_response();
    }

    let pos_id = payload.pos_id.unwrap_or_else(|| {
        format!("POS_MANUAL_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase())
    });
    let now = current_iso_timestamp();
    let reg_date = payload.registration_date.unwrap_or_else(|| now.chars().take(10).collect());

    if let Err(e) = sqlx::query(
        "INSERT INTO point_of_sales (pos_id, region, registration_date, operator) VALUES (?, ?, ?, ?);"
    )
    .bind(&pos_id)
    .bind(&payload.region)
    .bind(&reg_date)
    .bind(&payload.operator)
    .execute(&state.db)
    .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let audit_id = format!("AUD_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let details = format!("Registered PoS {} (region: {}, operator: {})", pos_id, payload.region, payload.operator);
    let _ = sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) VALUES (?, 'CREATE_POS', 'operator', ?, ?);"
    )
    .bind(&audit_id)
    .bind(&details)
    .bind(&now)
    .execute(&state.db)
    .await;

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "pos_id": pos_id,
            "region": payload.region,
            "registration_date": reg_date,
            "operator": payload.operator
        })),
    ).into_response()
}

// GET /api/locations
pub async fn list_locations(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let rows = match sqlx::query("SELECT location_id, state, district, region, synthetic_coordinates FROM locations ORDER BY state, district;")
        .fetch_all(&state.db)
        .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut list = Vec::new();
    for row in rows {
        list.push(serde_json::json!({
            "location_id": row.get::<String, _>("location_id"),
            "state": row.get::<String, _>("state"),
            "district": row.get::<String, _>("district"),
            "region": row.get::<String, _>("region"),
            "synthetic_coordinates": row.get::<String, _>("synthetic_coordinates")
        }));
    }

    Json(list).into_response()
}

// GET /api/pos
pub async fn list_pos(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let rows = match sqlx::query("SELECT pos_id, region, registration_date, operator FROM point_of_sales ORDER BY pos_id;")
        .fetch_all(&state.db)
        .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut list = Vec::new();
    for row in rows {
        list.push(serde_json::json!({
            "pos_id": row.get::<String, _>("pos_id"),
            "region": row.get::<String, _>("region"),
            "registration_date": row.get::<String, _>("registration_date"),
            "operator": row.get::<String, _>("operator")
        }));
    }

    Json(list).into_response()
}

// GET /api/fraud_reports
pub async fn list_fraud_reports(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let rows = match sqlx::query("SELECT report_id, mobile_number, report_type, timestamp, severity, source, description FROM fraud_reports ORDER BY timestamp DESC;")
        .fetch_all(&state.db)
        .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut list = Vec::new();
    for row in rows {
        list.push(serde_json::json!({
            "report_id": row.get::<String, _>("report_id"),
            "mobile_number": row.get::<String, _>("mobile_number"),
            "report_type": row.get::<String, _>("report_type"),
            "timestamp": row.get::<String, _>("timestamp"),
            "severity": row.get::<String, _>("severity"),
            "source": row.get::<String, _>("source"),
            "description": row.get::<Option<String>, _>("description")
        }));
    }

    Json(list).into_response()
}

// POST /api/ml/train
pub async fn train_ml_model(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let script_path = if std::path::Path::new("ml/train.py").exists() {
        "ml/train.py"
    } else if std::path::Path::new("../ml/train.py").exists() {
        "../ml/train.py"
    } else {
        return (StatusCode::NOT_FOUND, "ML training script not found").into_response();
    };

    let output = match std::process::Command::new("python").arg(script_path).output() {
        Ok(out) => out,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to execute python: {}", e)).into_response(),
    };

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("ML Training failed: {}", err_msg)).into_response();
    }

    // Audit log
    let audit_id = format!("AUD_{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let now = chrono::Utc::now().naive_utc().format("%Y-%m-%dT%H:%M:%S").to_string();
    let _ = sqlx::query(
        "INSERT INTO audit_logs (audit_id, action, user, details, timestamp) VALUES (?, 'TRAIN_ML_MODEL', 'operator', 'Re-trained Isolation Forest and Random Forest models', ?);"
    )
    .bind(&audit_id)
    .bind(&now)
    .execute(&state.db)
    .await;

    get_ml_status().await.into_response()
}

// GET /api/ml/status
pub async fn get_ml_status() -> impl IntoResponse {
    let meta_path = if std::path::Path::new("ml/models/model_metadata.json").exists() {
        "ml/models/model_metadata.json"
    } else if std::path::Path::new("../ml/models/model_metadata.json").exists() {
        "../ml/models/model_metadata.json"
    } else {
        return Json(serde_json::json!({
            "status": "not_trained",
            "message": "No ML model artifacts found. Click 'Train ML Model' to train initial model."
        })).into_response();
    };

    match std::fs::read_to_string(meta_path) {
        Ok(content) => {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                Json(serde_json::json!({
                    "status": "trained",
                    "metadata": val
                })).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, "Invalid JSON in model metadata").into_response()
            }
        }
        Err(_) => Json(serde_json::json!({
            "status": "not_trained"
        })).into_response(),
    }
}


