-- ============================================================
-- Vectoryn FleetSense — Domain Schema
-- Fleet, Drivers, Telemetry, Fuel, Maintenance, AI
-- ============================================================

-- ── AVL Parameter Dictionary (seeded from FMB AVL IDs Rev 13) ──
CREATE TABLE IF NOT EXISTS avl_parameters (
    avl_id          INT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    units           VARCHAR(40),
    param_group     VARCHAR(40),   -- Permanent|LVCAN|OBD|Eventual
    data_type       VARCHAR(20),   -- int|float|string
    multiplier      NUMERIC DEFAULT 1,
    description     TEXT
);
CREATE INDEX IF NOT EXISTS idx_avl_group ON avl_parameters(param_group);

-- ── Sensor Calibrations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_calibrations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    device_id           BIGINT NOT NULL,           -- tc_devices.id
    avl_id              INT NOT NULL REFERENCES avl_parameters(avl_id),
    cal_type            VARCHAR(20) NOT NULL,      -- linear|table|formula
    multiplier          NUMERIC,
    offset_val          NUMERIC,
    formula             TEXT,
    calibration_points  JSONB,                     -- [{raw, real}, ...]
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cal_device ON sensor_calibrations(tenant_id, device_id);

-- ── Asset Groups Members ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_group_members (
    group_id    UUID NOT NULL REFERENCES asset_groups(id) ON DELETE CASCADE,
    device_id   BIGINT NOT NULL,
    PRIMARY KEY (group_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_agm_device ON asset_group_members(device_id);

-- ── Drivers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(120) NOT NULL,
    employee_no         VARCHAR(40),
    email               VARCHAR(200),
    phone               VARCHAR(30),
    license_no          VARCHAR(60),
    license_class       VARCHAR(20),
    ibutton_id          VARCHAR(30) UNIQUE,
    rfid_card_uid       VARCHAR(30) UNIQUE,
    status              VARCHAR(20) DEFAULT 'active',
    authorized_types    TEXT[],               -- asset types this driver can operate
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drivers_tenant   ON drivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_drivers_ibutton  ON drivers(ibutton_id);

-- ── Trip Segments (HYPERTABLE) ───────────────────────────────
CREATE TABLE IF NOT EXISTS trip_segments (
    id              UUID DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    device_id       BIGINT NOT NULL,
    driver_id       UUID REFERENCES drivers(id),
    ts_start        TIMESTAMPTZ NOT NULL,
    ts_end          TIMESTAMPTZ,
    distance_m      NUMERIC DEFAULT 0,
    duration_s      INT DEFAULT 0,
    idle_s          INT DEFAULT 0,
    max_speed_kmh   NUMERIC DEFAULT 0,
    avg_speed_kmh   NUMERIC DEFAULT 0,
    fuel_consumed_l NUMERIC DEFAULT 0,
    ev_kwh          NUMERIC DEFAULT 0,
    start_lat       NUMERIC,
    start_lon       NUMERIC,
    end_lat         NUMERIC,
    end_lon         NUMERIC,
    start_address   TEXT,
    end_address     TEXT,
    driving_score   NUMERIC,
    status          VARCHAR(20) DEFAULT 'open',   -- open|closed
    PRIMARY KEY (id, ts_start)
);
SELECT create_hypertable('trip_segments','ts_start',
    chunk_time_interval => INTERVAL '1 week',
    if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_trips_tenant_device
    ON trip_segments(tenant_id, device_id, ts_start DESC);
CREATE INDEX IF NOT EXISTS idx_trips_driver
    ON trip_segments(driver_id, ts_start DESC);

-- ── Driver Events (HYPERTABLE) ───────────────────────────────
CREATE TABLE IF NOT EXISTS driver_events (
    id          UUID DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    device_id   BIGINT NOT NULL,
    driver_id   UUID REFERENCES drivers(id),
    trip_id     UUID,
    ts          TIMESTAMPTZ NOT NULL,
    event_type  VARCHAR(30) NOT NULL,
    severity    SMALLINT DEFAULT 1,
    speed_kmh   NUMERIC,
    lat         NUMERIC,
    lon         NUMERIC,
    avl_data    JSONB,
    PRIMARY KEY (id, ts)
);
SELECT create_hypertable('driver_events','ts',
    chunk_time_interval => INTERVAL '1 week',
    if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_devt_tenant_device
    ON driver_events(tenant_id, device_id, ts DESC);

-- ── Driver Scores ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    driver_id       UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    trips_count     INT DEFAULT 0,
    distance_km     NUMERIC DEFAULT 0,
    score           NUMERIC DEFAULT 100,
    breakdown       JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(driver_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_scores_driver ON driver_scores(tenant_id, driver_id);

-- ── Geofence Zones ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo_zones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    zone_type   VARCHAR(10)  DEFAULT 'circle',   -- circle|polygon
    center_lat  NUMERIC,
    center_lon  NUMERIC,
    radius_m    NUMERIC,
    polygon     JSONB,                            -- [{lat,lon},...]
    max_speed   NUMERIC,
    color       VARCHAR(7) DEFAULT '#0D7377',
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zones_tenant ON geo_zones(tenant_id);

-- ── Geofence Events ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo_zone_events (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    device_id   BIGINT NOT NULL,
    zone_id     UUID NOT NULL REFERENCES geo_zones(id) ON DELETE CASCADE,
    event_type  VARCHAR(10) NOT NULL,   -- enter|exit
    ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lat         NUMERIC,
    lon         NUMERIC,
    speed_kmh   NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_gze_tenant   ON geo_zone_events(tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_gze_device   ON geo_zone_events(device_id, ts DESC);

-- ── POI Points ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poi_points (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    lat         NUMERIC NOT NULL,
    lon         NUMERIC NOT NULL,
    radius_m    NUMERIC DEFAULT 100,
    icon        VARCHAR(30) DEFAULT 'pin',
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Alert Definitions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_defs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    avl_id              INT REFERENCES avl_parameters(avl_id),
    param_key           VARCHAR(60),              -- fallback for non-AVL params
    operator            VARCHAR(10) NOT NULL,     -- gt|lt|eq|gte|lte|neq
    threshold           NUMERIC,
    threshold_text      VARCHAR(100),
    scope_type          VARCHAR(20) DEFAULT 'all',-- all|group|device
    scope_id            UUID,
    severity            VARCHAR(10) DEFAULT 'warning',
    cooldown_min        INT DEFAULT 5,
    notify_email        BOOLEAN DEFAULT TRUE,
    notify_sse          BOOLEAN DEFAULT TRUE,
    notify_webhook      BOOLEAN DEFAULT FALSE,
    active              BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON alert_defs(tenant_id);

-- ── Alert History ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_history (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    alert_id    UUID NOT NULL REFERENCES alert_defs(id) ON DELETE CASCADE,
    device_id   BIGINT NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    value_json  JSONB,
    severity    VARCHAR(10),
    acknowledged BOOLEAN DEFAULT FALSE,
    ack_by      UUID REFERENCES app_users(id),
    ack_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alh_tenant  ON alert_history(tenant_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alh_device  ON alert_history(device_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alh_unacked ON alert_history(tenant_id, acknowledged)
    WHERE acknowledged = FALSE;

-- ── Fuel Fill Events (HYPERTABLE) ────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_fill_events (
    id              UUID DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    device_id       BIGINT NOT NULL,
    ts              TIMESTAMPTZ NOT NULL,
    volume_l        NUMERIC,
    level_before_l  NUMERIC,
    level_after_l   NUMERIC,
    lat             NUMERIC,
    lon             NUMERIC,
    source          VARCHAR(20) DEFAULT 'lls',   -- lls|can|obd
    confidence      NUMERIC DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'pending',
    acknowledged_by UUID REFERENCES app_users(id),
    PRIMARY KEY (id, ts)
);
SELECT create_hypertable('fuel_fill_events','ts',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ffe_device ON fuel_fill_events(tenant_id, device_id, ts DESC);

-- ── Fuel Drain Events (HYPERTABLE) ───────────────────────────
CREATE TABLE IF NOT EXISTS fuel_drain_events (
    id              UUID DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    device_id       BIGINT NOT NULL,
    ts              TIMESTAMPTZ NOT NULL,
    volume_l        NUMERIC,
    level_before_l  NUMERIC,
    level_after_l   NUMERIC,
    lat             NUMERIC,
    lon             NUMERIC,
    drain_type      VARCHAR(30) DEFAULT 'suspected',
    confidence      NUMERIC DEFAULT 0,
    evidence        JSONB,
    status          VARCHAR(20) DEFAULT 'open',
    acknowledged_by UUID REFERENCES app_users(id),
    PRIMARY KEY (id, ts)
);
SELECT create_hypertable('fuel_drain_events','ts',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_fde_device ON fuel_drain_events(tenant_id, device_id, ts DESC);

-- ── EV Charge Sessions (HYPERTABLE) ─────────────────────────
CREATE TABLE IF NOT EXISTS charge_sessions (
    id          UUID DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    device_id   BIGINT NOT NULL,
    ts_start    TIMESTAMPTZ NOT NULL,
    ts_end      TIMESTAMPTZ,
    soc_start   NUMERIC,
    soc_end     NUMERIC,
    kwh_est     NUMERIC,
    lat         NUMERIC,
    lon         NUMERIC,
    notes       TEXT,
    PRIMARY KEY (id, ts_start)
);
SELECT create_hypertable('charge_sessions','ts_start',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_cs_device ON charge_sessions(tenant_id, device_id, ts_start DESC);

-- ── Daily KPI Snapshot ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_daily (
    tenant_id       UUID NOT NULL,
    device_id       BIGINT NOT NULL,
    day             DATE NOT NULL,
    trips_count     INT DEFAULT 0,
    distance_km     NUMERIC DEFAULT 0,
    engine_hours    NUMERIC DEFAULT 0,
    fuel_l          NUMERIC DEFAULT 0,
    ev_kwh          NUMERIC DEFAULT 0,
    idle_hours      NUMERIC DEFAULT 0,
    avg_score       NUMERIC,
    l_per_km        NUMERIC,
    l_per_hour      NUMERIC,
    kwh_per_km      NUMERIC,
    PRIMARY KEY (tenant_id, device_id, day)
);
CREATE INDEX IF NOT EXISTS idx_kpi_tenant_day ON kpi_daily(tenant_id, day DESC);

-- ── Maintenance Types ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    interval_km     NUMERIC,
    interval_hours  NUMERIC,
    interval_days   INT,
    priority        VARCHAR(20) DEFAULT 'normal'
);

-- ── Maintenance Schedules ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    device_id           BIGINT NOT NULL,
    type_id             UUID REFERENCES maintenance_types(id),
    last_done_km        NUMERIC,
    last_done_hours     NUMERIC,
    last_done_date      DATE,
    next_due_km         NUMERIC,
    next_due_hours      NUMERIC,
    next_due_date       DATE,
    alert_before_km     NUMERIC DEFAULT 500,
    alert_before_days   INT DEFAULT 7
);
CREATE INDEX IF NOT EXISTS idx_ms_device ON maintenance_schedules(tenant_id, device_id);

-- ── Work Orders ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    device_id       BIGINT NOT NULL,
    type_id         UUID REFERENCES maintenance_types(id),
    status          VARCHAR(20) DEFAULT 'pending',
    created_by      VARCHAR(20) DEFAULT 'manual',   -- manual|ai|alert
    priority        VARCHAR(20) DEFAULT 'normal',
    due_date        DATE,
    completed_date  DATE,
    cost            NUMERIC,
    notes           TEXT,
    ai_evidence     JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wo_tenant  ON work_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wo_device  ON work_orders(device_id, status);

-- ── Predictive Scores ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictive_scores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    device_id           BIGINT NOT NULL,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    failure_risk_score  NUMERIC DEFAULT 0,
    top_factors         JSONB,
    model_version       VARCHAR(20),
    recommended_action  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ps_device ON predictive_scores(tenant_id, device_id, computed_at DESC);

-- ── TimescaleDB compression policies ─────────────────────────
ALTER TABLE trip_segments  SET (timescaledb.compress,
    timescaledb.compress_orderby   = 'ts_start DESC',
    timescaledb.compress_segmentby = 'device_id');
SELECT add_compression_policy('trip_segments',  INTERVAL '30 days', if_not_exists => TRUE);

ALTER TABLE driver_events  SET (timescaledb.compress,
    timescaledb.compress_orderby   = 'ts DESC',
    timescaledb.compress_segmentby = 'device_id');
SELECT add_compression_policy('driver_events',  INTERVAL '30 days', if_not_exists => TRUE);

ALTER TABLE fuel_fill_events SET (timescaledb.compress,
    timescaledb.compress_orderby   = 'ts DESC',
    timescaledb.compress_segmentby = 'device_id');
SELECT add_compression_policy('fuel_fill_events', INTERVAL '90 days', if_not_exists => TRUE);

ALTER TABLE fuel_drain_events SET (timescaledb.compress,
    timescaledb.compress_orderby   = 'ts DESC',
    timescaledb.compress_segmentby = 'device_id');
SELECT add_compression_policy('fuel_drain_events', INTERVAL '90 days', if_not_exists => TRUE);

