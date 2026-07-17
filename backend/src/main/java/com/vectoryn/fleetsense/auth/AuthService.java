package com.vectoryn.fleetsense.auth;

import com.vectoryn.fleetsense.model.SecurityContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class AuthService {

    @Autowired private JdbcTemplate db;

    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(12);
    private final SecureRandom rng = new SecureRandom();

    // ── Resolve session token or API key → SecurityContext ────────────────────
    public SecurityContext resolve(String token, String apiKey) {
        if (token != null && !token.isBlank())  return resolveSession(token.trim());
        if (apiKey != null && !apiKey.isBlank()) return resolveApiKey(apiKey.trim());
        return null;
    }

    // ── Session resolution ────────────────────────────────────────────────────
    private SecurityContext resolveSession(String token) {
        try {
            var rows = db.queryForList(
                "SELECT s.user_id, s.tenant_id, s.expires_at, " +
                "u.email, u.name, u.is_super_admin, u.status " +
                "FROM app_sessions s JOIN app_users u ON u.id = s.user_id " +
                "WHERE s.token = ? AND s.expires_at > NOW() AND u.status = 'active'",
                token);
            if (rows.isEmpty()) return null;

            var row = rows.get(0);
            // Touch last_seen
            db.update("UPDATE app_sessions SET last_seen = NOW() WHERE token = ?", token);

            String userId   = row.get("user_id").toString();
            String tenantId = row.get("tenant_id").toString();
            boolean isSuper = (Boolean) row.get("is_super_admin");

            return buildContext(userId, tenantId,
                row.get("email").toString(),
                row.get("name").toString(),
                isSuper);
        } catch (Exception e) {
            return null;
        }
    }

    // ── API key resolution ────────────────────────────────────────────────────
    private SecurityContext resolveApiKey(String rawKey) {
        try {
            // SHA-256 hash of key for lookup
            var digest = java.security.MessageDigest.getInstance("SHA-256");
            var hashBytes = digest.digest(rawKey.getBytes());
            var hash = HexFormat.of().formatHex(hashBytes);

            var rows = db.queryForList(
                "SELECT k.tenant_id, k.scopes, k.asset_group_id, k.expires_at " +
                "FROM api_keys k WHERE k.key_hash = ?", hash);
            if (rows.isEmpty()) return null;

            var row = rows.get(0);
            if (row.get("expires_at") != null) {
                var exp = ((java.sql.Timestamp) row.get("expires_at")).toInstant();
                if (Instant.now().isAfter(exp)) return null;
            }

            db.update("UPDATE api_keys SET last_used = NOW() WHERE key_hash = ?", hash);

            String tenantId = row.get("tenant_id").toString();
            // API keys get minimal permissions from scopes — simplified for Phase 1
            Map<String, Integer> perms = new HashMap<>();
            perms.put("ops.map", 1); perms.put("ops.trips", 1);
            perms.put("alerts", 1); perms.put("fleet", 1);

            Set<String> groups = new HashSet<>();
            if (row.get("asset_group_id") != null)
                groups.add(row.get("asset_group_id").toString());

            return new SecurityContext("api-key", tenantId, "api", "API Key",
                false, perms, groups);
        } catch (Exception e) {
            return null;
        }
    }

    // ── Build full RBAC context for a user ────────────────────────────────────
    private SecurityContext buildContext(String userId, String tenantId,
                                         String email, String name, boolean isSuper) {
        Map<String, Integer> permissions = new HashMap<>();

        if (!isSuper) {
            // Load role permissions for this user
            var perms = db.queryForList(
                "SELECT m.key, rp.can_view, rp.can_edit, rp.can_delete, rp.can_export " +
                "FROM app_user_roles ur " +
                "JOIN app_role_permissions rp ON rp.role_id = ur.role_id " +
                "JOIN app_modules m ON m.id = rp.module_id " +
                "WHERE ur.user_id = ?::uuid", userId);

            for (var p : perms) {
                int mask = 0;
                if (Boolean.TRUE.equals(p.get("can_view")))   mask |= 1;
                if (Boolean.TRUE.equals(p.get("can_edit")))   mask |= 2;
                if (Boolean.TRUE.equals(p.get("can_delete"))) mask |= 4;
                if (Boolean.TRUE.equals(p.get("can_export"))) mask |= 8;
                permissions.merge(p.get("key").toString(), mask, (a, b) -> a | b);
            }
        }

        // Load asset group scopes
        Set<String> groups = new HashSet<>();
        var groupRows = db.queryForList(
            "SELECT DISTINCT agrs.asset_group_id::text " +
            "FROM app_user_roles ur " +
            "JOIN asset_group_role_scope agrs ON agrs.role_id = ur.role_id " +
            "WHERE ur.user_id = ?::uuid", userId);
        for (var g : groupRows) groups.add(g.values().iterator().next().toString());

        return new SecurityContext(userId, tenantId, email, name, isSuper, permissions, groups);
    }

    // ── Login ─────────────────────────────────────────────────────────────────
    public Map<String, Object> login(String email, String password, String ip, String ua) {
        try {
            var rows = db.queryForList(
                "SELECT id, tenant_id, password_hash, name, is_super_admin, status " +
                "FROM app_users WHERE email = ?", email.toLowerCase().trim());

            if (rows.isEmpty()) return error("Invalid credentials");
            var user = rows.get(0);
            if (!"active".equals(user.get("status"))) return error("Account disabled");
            if (!bcrypt.matches(password, user.get("password_hash").toString()))
                return error("Invalid credentials");

            String userId   = user.get("id").toString();
            String tenantId = user.get("tenant_id").toString();

            // Generate session token
            byte[] bytes = new byte[48];
            rng.nextBytes(bytes);
            String token = HexFormat.of().formatHex(bytes);

            db.update(
                "INSERT INTO app_sessions (token, user_id, tenant_id, expires_at, ip, user_agent) " +
                "VALUES (?, ?::uuid, ?::uuid, ?, ?, ?)",
                token, userId, tenantId,
                java.sql.Timestamp.from(Instant.now().plus(7, ChronoUnit.DAYS)),
                ip, ua);

            db.update("UPDATE app_users SET last_login = NOW() WHERE id = ?::uuid", userId);

            var ctx = buildContext(userId, tenantId,
                email, user.get("name").toString(),
                (Boolean) user.get("is_super_admin"));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("token", token);
            result.put("userId", userId);
            result.put("tenantId", tenantId);
            result.put("name", user.get("name"));
            result.put("email", email);
            result.put("isSuperAdmin", user.get("is_super_admin"));
            result.put("permissions", ctx.permissions);
            result.put("expiresAt", Instant.now().plus(7, ChronoUnit.DAYS).toString());
            return result;
        } catch (Exception e) {
            return error("Login failed: " + e.getMessage());
        }
    }

    // ── Logout ────────────────────────────────────────────────────────────────
    public void logout(String token) {
        if (token != null) db.update("DELETE FROM app_sessions WHERE token = ?", token);
    }

    // ── Hash a password ───────────────────────────────────────────────────────
    public String hashPassword(String raw) { return bcrypt.encode(raw); }

    private Map<String, Object> error(String msg) {
        return Map.of("error", msg);
    }
}
