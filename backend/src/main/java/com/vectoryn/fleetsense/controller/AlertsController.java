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
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Boolean acknowledged,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        StringBuilder sql = new StringBuilder(
            "SELECT ah.id, ah.triggered_at, ah.severity, ah.acknowledged, " +
            "ad.name, ad.param_key " +
            "FROM alert_history ah " +
            "JOIN alert_defs ad ON ad.id = ah.alert_id " +
            "WHERE ah.tenant_id = ?::uuid ");
        List<Object> params = new ArrayList<>();
        params.add(ctx.tenantId);
        if (acknowledged != null) { sql.append("AND ah.acknowledged = ? "); params.add(acknowledged); }
        sql.append("ORDER BY ah.triggered_at DESC LIMIT ?");
        params.add(size);

        var rows = db.queryForList(sql.toString(), params.toArray());
        return ResponseEntity.ok(Map.of("data", rows));
    }

    @GetMapping("/rules")
    public ResponseEntity<?> rules(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        var rows = db.queryForList(
            "SELECT id, name, param_key, operator, threshold, severity, active " +
            "FROM alert_defs WHERE tenant_id = ?::uuid ORDER BY name", ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", rows));
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
