# Multi-stage Dockerfile for Trinetra Backend & ML Runtime

# Stage 1: Build Rust backend
FROM rust:1.78-slim AS builder

WORKDIR /usr/src/trinetra

# Copy backend source
COPY backend/Cargo.toml backend/Cargo.lock backend/
COPY backend/src backend/src
COPY data/migrations data/migrations

# Build release binary
WORKDIR /usr/src/trinetra/backend
RUN cargo build --release

# Stage 2: Combined Python ML + Rust Execution Environment
FROM python:3.11-slim-bookworm AS runtime

WORKDIR /app

# Install System utilities & SQLite
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy python requirements & install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application directories
COPY data-generator/ data-generator/
COPY data/ data/
COPY ml/ ml/

# Copy compiled Rust binary from builder stage
COPY --from=builder /usr/src/trinetra/backend/target/release/trinetra-backend /app/trinetra-backend

# Generate database & train initial ML models
RUN python data-generator/generator.py --clean && python ml/train.py

EXPOSE 3000

ENV DATABASE_URL="sqlite://data/trinetra.db"

CMD ["/app/trinetra-backend"]
