package com.vectoryn.fleetsense.controller;

import com.vectoryn.fleetsense.auth.AuthService;
import com.vectoryn.fleetsense.model.SecurityContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

@RestController
@RequestMapping("/api/v1/users-roles")
public class UsersRolesController {

    @Autowired private JdbcTemplate db;
    @Autowired private AuthService auth;

    // ── Auth helper — called at top of every endpoint ────────────────────────
    private SecurityContext ctx(HttpServletRequest req) {
        return auth.resolve(
            req.getHeader("X-Session-Token"),
            req.getHeader("X-Api-Key"));
    }

    // ── POST /api/v1/users-roles/login ───────────────────────────────────────
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body,
                                    HttpServletRequest req) {
        var result = auth.login(
            body.getOrDefault("email", ""),
            body.getOrDefault("password", ""),
            req.getRemoteAddr(),
            req.getHeader("User-Agent"));
        if (result.containsKey("error"))
            return ResponseEntity.status(401).body(result);
        return ResponseEntity.ok(result);
    }

    // ── POST /api/v1/users-roles/logout ──────────────────────────────────────
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest req) {
        auth.logout(req.getHeader("X-Session-Token"));
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ── GET /api/v1/users-roles/me ───────────────────────────────────────────
    @GetMapping("/me")
    public ResponseEntity<?> me(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(Map.of(
            "userId",      ctx.userId,
            "tenantId",    ctx.tenantId,
            "name",        ctx.name,
            "email",       ctx.email,
            "isSuperAdmin",ctx.isSuperAdmin,
            "permissions", ctx.permissions
        ));
    }

    // ── GET /api/v1/users-roles/users ────────────────────────────────────────
    @GetMapping("/users")
    public ResponseEntity<?> listUsers(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("admin.users")) return ResponseEntity.status(403).build();

        var users = db.queryForList(
            "SELECT id, email, name, is_super_admin, status, last_login, created_at " +
            "FROM app_users WHERE tenant_id = ?::uuid ORDER BY name",
            ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", users));
    }

    // ── POST /api/v1/users-roles/users ───────────────────────────────────────
    @PostMapping("/users")
    public ResponseEntity<?> createUser(@RequestBody Map<String, Object> body,
                                         HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canEdit("admin.users")) return ResponseEntity.status(403).build();

        String email = body.getOrDefault("email", "").toString().toLowerCase().trim();
        String name  = body.getOrDefault("name", "").toString().trim();
        String pass  = body.getOrDefault("password", "").toString();

        if (email.isEmpty() || name.isEmpty() || pass.length() < 8)
            return ResponseEntity.badRequest()
                .body(Map.of("error", "email, name, and password (min 8 chars) required"));

        try {
            db.update(
                "INSERT INTO app_users (tenant_id, email, password_hash, name) " +
                "VALUES (?::uuid, ?, ?, ?)",
                ctx.tenantId, email, auth.hashPassword(pass), name);
            return ResponseEntity.ok(Map.of("ok", true, "email", email));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "Email already exists"));
        }
    }

    // ── GET /api/v1/users-roles/modules ──────────────────────────────────────
    @GetMapping("/modules")
    public ResponseEntity<?> listModules(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        var modules = db.queryForList(
            "SELECT id, key, label, parent_id, sort_order FROM app_modules ORDER BY sort_order");
        return ResponseEntity.ok(Map.of("data", modules));
    }

    // ── GET /api/v1/users-roles/roles ────────────────────────────────────────
    @GetMapping("/roles")
    public ResponseEntity<?> listRoles(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("admin.users")) return ResponseEntity.status(403).build();
        var roles = db.queryForList(
            "SELECT id, name, description, is_system FROM app_roles " +
            "WHERE tenant_id = ?::uuid ORDER BY name", ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", roles));
    }

    // ── GET /api/v1/users-roles/health ───────────────────────────────────────
    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of(
            "status", "UP",
            "service", "Vectoryn FleetSense Backend",
            "version", "1.0.0"));
    }
}
