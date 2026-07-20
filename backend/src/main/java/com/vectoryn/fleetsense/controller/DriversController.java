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
@RequestMapping("/api/v1/drivers")
public class DriversController {

    @Autowired private JdbcTemplate db;
    @Autowired private AuthService auth;

    private SecurityContext ctx(HttpServletRequest req) {
        return auth.resolve(req.getHeader("X-Session-Token"), req.getHeader("X-Api-Key"));
    }

    @GetMapping
    public ResponseEntity<?> list(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        var rows = db.queryForList(
            "SELECT d.id, d.name, d.phone, d.email, d.license_no, d.ibutton_id, " +
            "d.status, d.created_at, " +
            "ds.total_trips, ds.total_distance_km, ds.score_overall, " +
            "ds.score_speeding, ds.score_braking, ds.score_acceleration, ds.score_cornering " +
            "FROM drivers d " +
            "LEFT JOIN driver_scores ds ON ds.driver_id = d.id " +
            "  AND ds.period_date = CURRENT_DATE " +
            "WHERE d.tenant_id = ?::uuid " +
            "ORDER BY d.name",
            ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", rows));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canEdit("drivers")) return ResponseEntity.status(403).build();

        String name = body.getOrDefault("name","").toString().trim();
        if (name.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error","name required"));

        try {
            db.update(
                "INSERT INTO drivers (tenant_id, name, phone, email, license_no, ibutton_id) " +
                "VALUES (?::uuid, ?, ?, ?, ?, ?)",
                ctx.tenantId, name,
                body.getOrDefault("phone","").toString(),
                body.getOrDefault("email","").toString(),
                body.getOrDefault("licenseNo","").toString(),
                body.getOrDefault("ibuttonId","").toString());
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id,
                                     @RequestBody Map<String,Object> body,
                                     HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canEdit("drivers")) return ResponseEntity.status(403).build();

        db.update(
            "UPDATE drivers SET name=?, phone=?, email=?, license_no=?, ibutton_id=?, status=? " +
            "WHERE id=?::uuid AND tenant_id=?::uuid",
            body.getOrDefault("name",""),
            body.getOrDefault("phone",""),
            body.getOrDefault("email",""),
            body.getOrDefault("licenseNo",""),
            body.getOrDefault("ibuttonId",""),
            body.getOrDefault("status","active"),
            id, ctx.tenantId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canDelete("drivers")) return ResponseEntity.status(403).build();
        db.update("UPDATE drivers SET status='inactive' WHERE id=?::uuid AND tenant_id=?::uuid",
            id, ctx.tenantId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // Compute and store behaviour scores from trip history
    @PostMapping("/{id}/score")
    public ResponseEntity<?> score(@PathVariable String id, HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        // Find device assigned to this driver (via iButton or manual assignment)
        var driver = db.queryForList(
            "SELECT id, name, ibutton_id FROM drivers WHERE id=?::uuid AND tenant_id=?::uuid",
            id, ctx.tenantId);
        if (driver.isEmpty()) return ResponseEntity.status(404).build();

        // Compute scoring from position history (last 30 days)
        // Score based on: harsh braking (io247), acceleration (io248), cornering (io249),
        // overspeed (io253), idle time, engine hours
        var scoreData = db.queryForList(
            "SELECT " +
            "  COUNT(*) as total_points, " +
            "  SUM(CASE WHEN (p.attributes::jsonb->>'io253')::int > 0 THEN 1 ELSE 0 END) as overspeed_events, " +
            "  SUM(CASE WHEN (p.attributes::jsonb->>'io247')::int > 0 THEN 1 ELSE 0 END) as harsh_brake_events, " +
            "  SUM(CASE WHEN (p.attributes::jsonb->>'io248')::int > 0 THEN 1 ELSE 0 END) as harsh_accel_events, " +
            "  SUM(CASE WHEN (p.attributes::jsonb->>'io249')::int > 0 THEN 1 ELSE 0 END) as harsh_corner_events, " +
            "  MAX(p.speed) as max_speed, " +
            "  AVG(p.speed) as avg_speed " +
            "FROM tc_positions p " +
            "JOIN tc_devices d ON d.id = p.deviceid " +
            "WHERE d.tenant_id = ?::uuid " +
            "AND p.fixtime > NOW() - INTERVAL '30 days' " +
            "AND p.attributes IS NOT NULL",
            ctx.tenantId);

        if (scoreData.isEmpty()) return ResponseEntity.ok(Map.of("score", 100));

        var sd = scoreData.get(0);
        long total = sd.get("total_points") != null ? ((Number)sd.get("total_points")).longValue() : 1;
        long overspeed = sd.get("overspeed_events") != null ? ((Number)sd.get("overspeed_events")).longValue() : 0;
        long brake = sd.get("harsh_brake_events") != null ? ((Number)sd.get("harsh_brake_events")).longValue() : 0;
        long accel = sd.get("harsh_accel_events") != null ? ((Number)sd.get("harsh_accel_events")).longValue() : 0;
        long corner = sd.get("harsh_corner_events") != null ? ((Number)sd.get("harsh_corner_events")).longValue() : 0;

        // Score: 100 base, deduct per event per 100 points
        double speedScore = Math.max(0, 100 - (overspeed * 100.0 / Math.max(total, 1)) * 5);
        double brakeScore = Math.max(0, 100 - (brake * 100.0 / Math.max(total, 1)) * 3);
        double accelScore = Math.max(0, 100 - (accel * 100.0 / Math.max(total, 1)) * 3);
        double cornerScore = Math.max(0, 100 - (corner * 100.0 / Math.max(total, 1)) * 2);
        double overall = (speedScore + brakeScore + accelScore + cornerScore) / 4.0;

        // Upsert score
        db.update(
            "INSERT INTO driver_scores (driver_id, period_date, score_overall, " +
            "score_speeding, score_braking, score_acceleration, score_cornering, total_trips) " +
            "VALUES (?::uuid, CURRENT_DATE, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT (driver_id, period_date) DO UPDATE SET " +
            "score_overall=EXCLUDED.score_overall, score_speeding=EXCLUDED.score_speeding, " +
            "score_braking=EXCLUDED.score_braking, score_acceleration=EXCLUDED.score_acceleration, " +
            "score_cornering=EXCLUDED.score_cornering",
            id, Math.round(overall), Math.round(speedScore),
            Math.round(brakeScore), Math.round(accelScore), Math.round(cornerScore), 0);

        return ResponseEntity.ok(Map.of(
            "overall", Math.round(overall),
            "speeding", Math.round(speedScore),
            "braking", Math.round(brakeScore),
            "acceleration", Math.round(accelScore),
            "cornering", Math.round(cornerScore)
        ));
    }

    @GetMapping("/scores")
    public ResponseEntity<?> scores(
            @RequestParam(defaultValue = "30") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        var rows = db.queryForList(
            "SELECT d.name, d.id, " +
            "AVG(ds.score_overall) as avg_score, " +
            "AVG(ds.score_speeding) as avg_speeding, " +
            "AVG(ds.score_braking) as avg_braking, " +
            "AVG(ds.score_acceleration) as avg_acceleration, " +
            "AVG(ds.score_cornering) as avg_cornering, " +
            "SUM(ds.total_trips) as total_trips, " +
            "SUM(ds.total_distance_km) as total_distance_km " +
            "FROM drivers d " +
            "LEFT JOIN driver_scores ds ON ds.driver_id = d.id " +
            "  AND ds.period_date >= CURRENT_DATE - ('" + days + " days')::INTERVAL " +
            "WHERE d.tenant_id = ?::uuid AND d.status = 'active' " +
            "GROUP BY d.id, d.name ORDER BY avg_score DESC NULLS LAST",
            ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", rows));
    }
}
