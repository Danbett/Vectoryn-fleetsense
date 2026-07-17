-- ============================================================
-- Vectoryn FleetSense — Seed Data
-- Platform modules, first tenant, superadmin user
-- ============================================================

-- ── Platform Modules ─────────────────────────────────────────
INSERT INTO app_modules (key, label, sort_order) VALUES
    ('dashboard',  'Dashboard',           1),
    ('ops',        'Operations',          2),
    ('ops.map',    'Live Map',            3),
    ('ops.trips',  'Trips',               4),
    ('ops.geo',    'Geofences & POI',     5),
    ('drivers',    'Drivers',             6),
    ('alerts',     'Alerts',              7),
    ('fleet',      'Fleet',               8),
    ('fuel',       'Fuel & Energy',       9),
    ('ev',         'EV Monitoring',      10),
    ('maintenance','Maintenance',         11),
    ('explorer',   'Telemetry Explorer', 12),
    ('reports',    'Reports',            13),
    ('commands',   'Commands',           14),
    ('portal',     'Client Portal',      15),
    ('admin',      'Administration',     16),
    ('admin.tenants','Tenants',          17),
    ('admin.users', 'Users & Roles',     18)
ON CONFLICT (key) DO NOTHING;

-- ── AVL Parameters — core set (extend with full Rev13 import) ──
INSERT INTO avl_parameters (avl_id, name, units, param_group, data_type, multiplier) VALUES
    (1,  'Digital Input 1',         NULL,     'Permanent', 'int',   1),
    (2,  'Digital Input 2',         NULL,     'Permanent', 'int',   1),
    (9,  'Analog Input 1',          'V',      'Permanent', 'float', 0.001),
    (10, 'Analog Input 2',          'V',      'Permanent', 'float', 0.001),
    (12, 'Fuel Used GPS',           'L',      'Permanent', 'float', 0.001),
    (13, 'Fuel Rate GPS',           'L/h',    'Permanent', 'float', 0.01),
    (16, 'Total Odometer',          'km',     'Permanent', 'float', 0.001),
    (21, 'GSM Signal',              NULL,     'Permanent', 'int',   1),
    (24, 'Speed',                   'km/h',   'Permanent', 'int',   1),
    (25, 'BLE Temp 1',              '°C',     'Permanent', 'float', 0.01),
    (26, 'BLE Temp 2',              '°C',     'Permanent', 'float', 0.01),
    (27, 'BLE Temp 3',              '°C',     'Permanent', 'float', 0.01),
    (28, 'BLE Temp 4',              '°C',     'Permanent', 'float', 0.01),
    (36, 'OBD Engine RPM',          'rpm',    'OBD',       'int',   1),
    (42, 'OBD Engine Runtime',      'min',    'OBD',       'int',   1),
    (48, 'OBD Fuel Level',          '%',      'OBD',       'float', 0.4),
    (66, 'External Voltage',        'V',      'Permanent', 'float', 0.001),
    (67, 'Battery Voltage',         'V',      'Permanent', 'float', 0.001),
    (68, 'Battery Current',         'A',      'Permanent', 'float', 0.001),
    (69, 'GNSS Status',             NULL,     'Permanent', 'int',   1),
    (72, '1-Wire Temp 1',           '°C',     'Permanent', 'float', 0.1),
    (73, '1-Wire Temp 2',           '°C',     'Permanent', 'float', 0.1),
    (74, '1-Wire Temp 3',           '°C',     'Permanent', 'float', 0.1),
    (75, '1-Wire Temp 4',           '°C',     'Permanent', 'float', 0.1),
    (78, 'iButton ID',              NULL,     'Permanent', 'string',1),
    (80, 'Data Mode',               NULL,     'Permanent', 'int',   1),
    (81, 'Vehicle Speed CAN',       'km/h',   'LVCAN',     'int',   1),
    (83, 'Fuel Consumed CAN',       'L',      'LVCAN',     'float', 0.1),
    (84, 'Fuel Level CAN',          'L',      'LVCAN',     'float', 0.1),
    (85, 'Engine RPM CAN',          'rpm',    'LVCAN',     'int',   1),
    (89, 'Fuel Level CAN %',        '%',      'LVCAN',     'float', 0.1),
    (102,'Engine Worktime',         'h',      'LVCAN',     'float', 0.001),
    (107,'Fuel Consumed Counted',   'L',      'LVCAN',     'float', 0.001),
    (110,'Fuel Rate CAN',           'L/h',    'LVCAN',     'float', 0.01),
    (113,'Battery Level EV',        '%',      'Permanent', 'int',   1),
    (114,'Engine Load CAN',         '%',      'LVCAN',     'float', 0.1),
    (115,'Engine Temp CAN',         '°C',     'LVCAN',     'float', 0.1),
    (116,'Charger Connected',       NULL,     'Permanent', 'int',   1),
    (151,'Battery Temp EV CAN',     '°C',     'LVCAN',     'float', 0.1),
    (152,'Battery Level EV CAN',    '%',      'LVCAN',     'float', 0.1),
    (199,'Trip Odometer',           'km',     'Permanent', 'float', 0.001),
    (201,'LLS Fuel Level 1',        'mm',     'Permanent', 'int',   1),
    (202,'LLS Fuel Level 2',        'mm',     'Permanent', 'int',   1),
    (203,'LLS Fuel Temp 1',         '°C',     'Permanent', 'float', 0.1),
    (239,'Ignition',                NULL,     'Permanent', 'int',   1),
    (240,'Movement',                NULL,     'Permanent', 'int',   1),
    (243,'Green Driving Duration',  's',      'Eventual',  'int',   1),
    (247,'Harsh Braking',           NULL,     'Eventual',  'int',   1),
    (248,'Harsh Acceleration',      NULL,     'Eventual',  'int',   1),
    (249,'Harsh Cornering',         NULL,     'Eventual',  'int',   1),
    (253,'Overspeeding',            NULL,     'Eventual',  'int',   1),
    (256,'VIN',                     NULL,     'OBD',       'string',1),
    (304,'EV Range on Battery',     'km',     'LVCAN',     'float', 0.1),
    (305,'EV Range on Fuel',        'km',     'LVCAN',     'float', 0.1)
ON CONFLICT (avl_id) DO NOTHING;

-- ── First Tenant: Vectoryn Dynamics ──────────────────────────
INSERT INTO tenants (id, name, slug, primary_color, billing_plan, timezone)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Vectoryn Dynamics Limited',
    'vectoryn',
    '#0D7377',
    'enterprise',
    'Africa/Nairobi'
) ON CONFLICT (id) DO NOTHING;

-- ── Superadmin User ───────────────────────────────────────────
-- Password: FleetSense2026! (bcrypt $2b$12$ hash — change on first login)
INSERT INTO app_users (id, tenant_id, email, password_hash, name, is_super_admin)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'daniel@vectoryndynamics.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TgxwIOfhwAfz9hCZkTXHCS5CIaFS',
    'Eng. Daniel Bett',
    TRUE
) ON CONFLICT (id) DO NOTHING;

