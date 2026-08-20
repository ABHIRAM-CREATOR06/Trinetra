use axum::{
    routing::{get, post, put},
    Router,
};
use std::net::SocketAddr;
use std::path::Path;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod routes;
mod risk_engine;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize Logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "trinetra_backend=debug,axum=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 2. Resolve Database Path
    // Since the server can be run from the root or the backend directory, we handle both.
    let db_url = if std::env::var("DATABASE_URL").is_ok() {
        std::env::var("DATABASE_URL")?
    } else {
        let path1 = Path::new("data/trinetra.db");
        let path2 = Path::new("../data/trinetra.db");
        
        let target_path = if path1.exists() {
            path1.to_string_lossy().into_owned()
        } else if path2.exists() {
            path2.to_string_lossy().into_owned()
        } else {
            // Default to root directory relative path
            "data/trinetra.db".to_string()
        };
        
        // Ensure parent directories exist
        if let Some(parent) = Path::new(&target_path).parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        format!("sqlite://{}", target_path)
    };

    println!("[*] Connecting to SQLite database at: {}", db_url);

    // 3. Establish connection pool and run migrations
    let pool = sqlx::SqlitePool::connect(&db_url).await?;

    println!("[*] Running SQL migrations...");
    sqlx::migrate!("../data/migrations").run(&pool).await?;
    println!("[+] SQL Migrations completed successfully.");

    // 4. Configure State and Routing
    let state = routes::AppState { db: pool };

    let app = Router::new()
        .route("/", get(routes::health_check))
        .route("/api/subscribers", get(routes::list_subscribers))
        .route("/api/subscribers/:id", get(routes::get_subscriber))
        .route("/api/subscribers/:id/evaluate", post(routes::evaluate_subscriber))
        .route("/api/devices", get(routes::list_devices))
        .route("/api/devices/:id", get(routes::get_device))
        .route("/api/investigations", get(routes::list_investigations))
        .route("/api/investigations/:id", put(routes::update_investigation))
        .route("/api/audit_logs", get(routes::list_audit_logs))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // 5. Start Server
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("[+] Trinetra Backend listening on http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
