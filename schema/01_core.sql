-- ============================================================
-- Vectoryn FleetSense — Core Schema
-- Applies automatically on first DB container start
-- (mounted at /docker-entrypoint-initdb.d/)
-- ============================================================

-- TimescaleDB already enabled by Block 15

-- ── Tenants ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(120) NOT NULL,
    slug            VARCHAR(60)  NOT NULL UNIQUE,
    logo_url        TEXT,
    primary_color   VARCHAR(7)   DEFAULT '#0D7377',
    api_base_url    TEXT,
    billing_plan    VARCHAR(30)  DEFAULT 'trial',
    status          VARCHAR(20)  DEFAULT 'active',
    timezone        VARCHAR(50)  DEFAULT 'Africa/Nairobi',
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Asset Groups ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_groups_tenant ON asset_groups(tenant_id);

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           VARCHAR(200) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(120) NOT NULL,
    is_super_admin  BOOLEAN DEFAULT FALSE,
    status          VARCHAR(20) DEFAULT 'active',
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email)
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON app_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email  ON app_users(email);

-- ── Sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_sessions (
    token       VARCHAR(128) PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    last_seen   TIMESTAMPTZ DEFAULT NOW(),
    ip          VARCHAR(45),
    user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON app_sessions(expires_at);

-- ── API Keys ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash        VARCHAR(255) NOT NULL UNIQUE,
    label           VARCHAR(100),
    scopes          JSONB DEFAULT '[]',
    asset_group_id  UUID REFERENCES asset_groups(id),
    rate_limit_rpm  INT DEFAULT 60,
    last_used       TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_by      UUID REFERENCES app_users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);

-- ── Modules ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_modules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(60) NOT NULL UNIQUE,
    label       VARCHAR(100) NOT NULL,
    parent_id   UUID REFERENCES app_modules(id),
    sort_order  INT DEFAULT 0
);

-- ── Roles ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_system   BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON app_roles(tenant_id);

-- ── User ↔ Role ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_user_roles (
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- ── Role Permissions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_role_permissions (
    role_id     UUID NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
    module_id   UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
    can_view    BOOLEAN DEFAULT FALSE,
    can_edit    BOOLEAN DEFAULT FALSE,
    can_delete  BOOLEAN DEFAULT FALSE,
    can_export  BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (role_id, module_id)
);

-- ── Asset Group → Role Scope ─────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_group_role_scope (
    role_id         UUID NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
    asset_group_id  UUID NOT NULL REFERENCES asset_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, asset_group_id)
);

-- ── Audit Log (tamper-evident hash chain) ────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    actor_id    UUID REFERENCES app_users(id),
    action      VARCHAR(60) NOT NULL,
    entity_type VARCHAR(60),
    entity_id   TEXT,
    before_json JSONB,
    after_json  JSONB,
    reason      TEXT,
    ip          VARCHAR(45),
    ts          TIMESTAMPTZ DEFAULT NOW(),
    row_hash    VARCHAR(64),
    prev_hash   VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

-- ─────────────────────────────────────────────────────────────
-- tc_devices EXTENSIONS (Traccar creates tc_devices — we extend)
-- Applied via ALTER after Traccar first run
-- Stored here as reference; run via Block 18
-- ─────────────────────────────────────────────────────────────
