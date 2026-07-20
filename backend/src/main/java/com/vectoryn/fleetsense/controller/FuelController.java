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
@RequestMapping("/api/v1/fuel")
public class FuelController {

    @Autowired private JdbcTemplate db;
    @Autowired private AuthService auth;

    private SecurityContext ctx(HttpServletRequest req) {
        return auth.resolve(req.getHeader("X-Session-Token"), req.getHeader("X-Api-Key"));
    }

    @GetMapping("/summary")
    public ResponseEntity<?> summary(
            @RequestParam(defaultValue = "7") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        int d = Math.max(1, Math.min(days, 365));

        // Single query — compute distance and engine hours directly in SQL
        var rows = db.queryForList(
            "SELECT d.id, d.name, d.powertrain, d.plate_no, " +
            "  d.tank_capacity_l, d.ev_pack_kwh, d.terminal_model, " +
            "  COUNT(p.id) as position_count, " +
            "  COALESCE(MAX(p.speed), 0) as max_speed, " +
            "  MIN(p.fixtime) as first_seen, " +
            "  MAX(p.fixtime) as last_seen, " +
            "  COALESCE(ROUND((" +
            "    MAX(CASE WHEN p.attributes IS NOT NULL " +
            "      THEN (p.attributes::jsonb->>'totalDistance')::float ELSE NULL END) - " +
            "    MIN(CASE WHEN p.attributes IS NOT NULL " +
            "      THEN (p.attributes::jsonb->>'totalDistance')::float ELSE NULL END)" +
            "  ) / 1000.0, 2), 0) as distance_km, " +
            "  COALESCE(ROUND((" +
            "    MAX(CASE WHEN p.attributes IS NOT NULL " +
            "      THEN (p.attributes::jsonb->>'hours')::float ELSE NULL END) - " +
            "    MIN(CASE WHEN p.attributes IS NOT NULL " +
            "      THEN (p.attributes::jsonb->>'hours')::float ELSE NULL END)" +
            "  ) / 3600000.0, 2), 0) as engine_hours " +
            "FROM tc_devices d " +
            "LEFT JOIN tc_positions p ON p.deviceid = d.id " +
            "  AND p.fixtime > NOW() - INTERVAL '" + d + " days' " +
            "WHERE d.tenant_id = ?::uuid " +
            "GROUP BY d.id, d.name, d.powertrain, d.plate_no, " +
            "  d.tank_capacity_l, d.ev_pack_kwh, d.terminal_model " +
            "ORDER BY d.name",
            ctx.tenantId);

        return ResponseEntity.ok(Map.of("data", rows, "days", d));
    }

    @GetMapping("/device/{id}/history")
    public ResponseEntity<?> deviceHistory(
            @PathVariable long id,
            @RequestParam(defaultValue = "24") int hours,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        var check = db.queryForList(
            "SELECT id, name, powertrain, tank_capacity_l, ev_pack_kwh " +
            "FROM tc_devices WHERE id = ? AND tenant_id = ?::uuid", id, ctx.tenantId);
        if (check.isEmpty()) return ResponseEntity.status(404).build();

        int h = Math.max(1, Math.min(hours, 720));
        var buckets = db.queryForList(
            "SELECT " +
            "  date_trunc('hour', fixtime) as hour, " +
            "  ROUND(AVG(speed)::numeric, 1) as avg_speed, " +
            "  ROUND(MAX(speed)::numeric, 1) as max_speed, " +
            "  ROUND(AVG((attributes::jsonb->>'io113')::float)::numeric, 1) as avg_battery, " +
            "  ROUND(AVG((attributes::jsonb->>'power')::float)::numeric, 3) as avg_voltage, " +
            "  COUNT(*) as points " +
            "FROM tc_positions " +
            "WHERE deviceid = ? " +
            "AND fixtime > NOW() - INTERVAL '" + h + " hours' " +
            "AND attributes IS NOT NULL " +
            "GROUP BY date_trunc('hour', fixtime) " +
            "ORDER BY hour ASC",
            id);

        return ResponseEntity.ok(Map.of(
            "data", buckets,
            "device", check.get(0)
        ));
    }

    @GetMapping("/events")
    public ResponseEntity<?> events(
            @RequestParam(required = false) Long deviceId,
            @RequestParam(defaultValue = "30") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        int d = Math.max(1, Math.min(days, 90));
        String devFilter = deviceId != null ? "AND p.deviceid = " + deviceId + " " : "";

        var events = db.queryForList(
            "WITH hourly AS (" +
            "  SELECT p.deviceid, d.name, d.powertrain, " +
            "    date_trunc('hour', p.fixtime) as hour, " +
            "    MIN((p.attributes::jsonb->>'io113')::float) as min_battery, " +
            "    MAX((p.attributes::jsonb->>'io113')::float) as max_battery " +
            "  FROM tc_positions p " +
            "  JOIN tc_devices d ON d.id = p.deviceid " +
            "  WHERE d.tenant_id = ?::uuid " + devFilter +
            "  AND d.powertrain = 'ev' " +
            "  AND p.fixtime > NOW() - INTERVAL '" + d + " days' " +
            "  AND p.attributes IS NOT NULL " +
            "  AND p.attributes::jsonb ? 'io113' " +
            "  GROUP BY p.deviceid, d.name, d.powertrain, date_trunc('hour', p.fixtime) " +
            "), " +
            "deltas AS (" +
            "  SELECT *, " +
            "    max_battery - LAG(max_battery) OVER (PARTITION BY deviceid ORDER BY hour) as delta " +
            "  FROM hourly " +
            ") " +
            "SELECT deviceid, name, powertrain, hour, " +
            "  min_battery, max_battery, delta, " +
            "  CASE WHEN delta > 5 THEN 'charge' " +
            "       WHEN delta < -5 THEN 'discharge' " +
            "       ELSE 'normal' END as event_type " +
            "FROM deltas " +
            "WHERE ABS(COALESCE(delta,0)) > 5 " +
            "ORDER BY hour DESC LIMIT 100",
            ctx.tenantId);

        return ResponseEntity.ok(Map.of("data", events, "days", d));
    }

    @GetMapping("/device/{id}/tank")
    public ResponseEntity<?> tank(@PathVariable long id, HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        var device = db.queryForList(
            "SELECT d.id, d.name, d.powertrain, d.tank_capacity_l, d.ev_pack_kwh, " +
            "p.attributes, p.fixtime, p.speed " +
            "FROM tc_devices d " +
            "LEFT JOIN tc_positions p ON p.id = d.positionid " +
            "WHERE d.id = ? AND d.tenant_id = ?::uuid", id, ctx.tenantId);
        if (device.isEmpty()) return ResponseEntity.status(404).build();
        return ResponseEntity.ok(Map.of("data", device.get(0)));
    }
}
