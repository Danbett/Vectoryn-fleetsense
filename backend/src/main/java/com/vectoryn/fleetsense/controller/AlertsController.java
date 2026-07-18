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
@RequestMapping("/api/v1/alerts")
public class AlertsController {

    @Autowired private JdbcTemplate db;
    @Autowired private AuthService auth;

    private SecurityContext ctx(HttpServletRequest req) {
        return auth.resolve(req.getHeader("X-Session-Token"), req.getHeader("X-Api-Key"));
    }

    @GetMapping("/history")
    public ResponseEntity<?> history(
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) Boolean acknowledged,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        StringBuilder sql = new StringBuilder(
            "SELECT ah.id, ah.triggered_at, ah.severity, ah.acknowledged, " +
            "ad.name, ad.param_key FROM alert_history ah " +
            "JOIN alert_defs ad ON ad.id = ah.alert_id " +
            "WHERE ah.tenant_id = ?::uuid ");
        List<Object> params = new ArrayList<>();
        params.add(ctx.tenantId);
        if (acknowledged != null) { sql.append("AND ah.acknowledged = ? "); params.add(acknowledged); }
        sql.append("ORDER BY ah.triggered_at DESC LIMIT ?");
        params.add(size);
        return ResponseEntity.ok(Map.of("data", db.queryForList(sql.toString(), params.toArray())));
    }

    @GetMapping("/rules")
    public ResponseEntity<?> rules(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        var rows = db.queryForList(
            "SELECT id, name, param_key, operator, threshold, severity, active, cooldown_min " +
            "FROM alert_defs WHERE tenant_id = ?::uuid ORDER BY name", ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", rows));
    }

    @PostMapping("/rules")
    public ResponseEntity<?> createRule(@RequestBody Map<String, Object> body,
                                         HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canEdit("alerts")) return ResponseEntity.status(403).build();
        String name = body.getOrDefault("name","").toString().trim();
        if (name.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error","name required"));
        db.update(
            "INSERT INTO alert_defs (tenant_id, name, param_key, operator, threshold, severity, " +
            "cooldown_min, notify_email, notify_sse, active) VALUES (?::uuid,?,?,?,?,?,?,?,?,true)",
            ctx.tenantId, name,
            body.getOrDefault("paramKey","speed").toString(),
            body.getOrDefault("operator","gt").toString(),
            Double.parseDouble(body.getOrDefault("threshold","0").toString()),
            body.getOrDefault("severity","warning").toString(),
            Integer.parseInt(body.getOrDefault("cooldownMin","5").toString()),
            Boolean.parseBoolean(body.getOrDefault("notifyEmail","true").toString()),
            Boolean.parseBoolean(body.getOrDefault("notifySse","true").toString()));
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/history/{id}/acknowledge")
    public ResponseEntity<?> acknowledge(@PathVariable long id, HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        db.update("UPDATE alert_history SET acknowledged = true, ack_by = ?::uuid, ack_at = NOW() " +
            "WHERE id = ? AND tenant_id = ?::uuid", ctx.userId, id, ctx.tenantId);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
