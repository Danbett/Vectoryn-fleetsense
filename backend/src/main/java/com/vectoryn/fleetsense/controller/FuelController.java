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

    // GET /api/v1/fuel/summary — fleet fuel/energy summary
    @GetMapping("/summary")
    public ResponseEntity<?> summary(
            @RequestParam(defaultValue = "7") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        var rows = db.queryForList(
            "SELECT d.id, d.name, d.powertrain, d.plate_no, d.tank_capacity_l, d.ev_pack_kwh, " +
            "COUNT(p.id) as position_count, " +
            "MAX(p.speed) as max_speed, " +
            "MIN(p.fixtime) as first_seen, MAX(p.fixtime) as last_seen " +
            "FROM tc_devices d " +
            "LEFT JOIN tc_positions p ON p.deviceid = d.id " +
            "  AND p.fixtime > NOW() - ('" + days + " days')::INTERVAL " +
            "WHERE d.tenant_id = ?::uuid " +
            "GROUP BY d.id, d.name, d.powertrain, d.plate_no, d.tank_capacity_l, d.ev_pack_kwh " +
            "ORDER BY d.name",
            ctx.tenantId);

        // Compute distance from totalDistance AVL field
        List<Map<String,Object>> enriched = new ArrayList<>();
        for (var row : rows) {
            Map<String,Object> r = new LinkedHashMap<>(row);
            long deviceId = ((Number) row.get("id")).longValue();
            try {
                var dist = db.queryForList(
                    "SELECT " +
                    "  MAX((attributes::jsonb->>'totalDistance')::float) - " +
                    "  MIN((attributes::jsonb->>'totalDistance')::float) as distance_m, " +
                    "  MAX((attributes::jsonb->>'hours')::float) - " +
                    "  MIN((attributes::jsonb->>'hours')::float) as engine_ms " +
                    "FROM tc_positions " +
                    "WHERE deviceid = ? " +
                    "AND fixtime > NOW() - ('" + days + " days')::INTERVAL " +
                    "AND attributes IS NOT NULL " +
                    "AND attributes::jsonb ? 'totalDistance'",
                    deviceId);
                if (!dist.isEmpty() && dist.get(0).get("distance_m") != null) {
                    double distM = ((Number) dist.get(0).get("distance_m")).doubleValue();
                    double distKm = Math.max(0, distM / 1000.0);
                    r.put("distance_km", Math.round(distKm * 10.0) / 10.0);
                    Object engMs = dist.get(0).get("engine_ms");
                    if (engMs != null) {
                        double engH = Math.max(0, ((Number)engMs).doubleValue() / 3600000.0);
                        r.put("engine_hours", Math.round(engH * 10.0) / 10.0);
                    }
                } else {
                    r.put("distance_km", 0);
                    r.put("engine_hours", 0);
                }
            } catch (Exception e) {
                r.put("distance_km", 0);
                r.put("engine_hours", 0);
            }
            enriched.add(r);
        }
        return ResponseEntity.ok(Map.of("data", enriched, "days", days));
    }

    // GET /api/v1/fuel/device/{id}/history — hourly consumption trend
    @GetMapping("/device/{id}/history")
    public ResponseEntity<?> deviceHistory(
            @PathVariable long id,
            @RequestParam(defaultValue = "24") int hours,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        var check = db.queryForList(
            "SELECT id, name, powertrain, tank_capacity_l, ev_pack_kwh FROM tc_devices " +
            "WHERE id = ? AND tenant_id = ?::uuid", id, ctx.tenantId);
        if (check.isEmpty()) return ResponseEntity.status(404).build();

        // Hourly bucketed data
        var buckets = db.queryForList(
            "SELECT " +
            "  date_trunc('hour', fixtime) as hour, " +
            "  AVG(speed) as avg_speed, " +
            "  MAX(speed) as max_speed, " +
            "  AVG((attributes::jsonb->>'io113')::float) as avg_battery, " +
            "  AVG((attributes::jsonb->>'power')::float) as avg_voltage, " +
            "  COUNT(*) as points " +
            "FROM tc_positions " +
            "WHERE deviceid = ? " +
            "AND fixtime > NOW() - ('" + hours + " hours')::INTERVAL " +
            "AND attributes IS NOT NULL " +
            "GROUP BY date_trunc('hour', fixtime) " +
            "ORDER BY hour ASC",
            id);

        // Latest battery/fuel level
        var latest = db.queryForList(
            "SELECT attributes FROM tc_positions WHERE deviceid = ? " +
            "ORDER BY fixtime DESC LIMIT 1", id);

        return ResponseEntity.ok(Map.of(
            "data", buckets,
            "device", check.get(0),
            "latest", latest.isEmpty() ? Map.of() : latest.get(0)
        ));
    }

    // GET /api/v1/fuel/events — fill and drain events
    @GetMapping("/events")
    public ResponseEntity<?> events(
            @RequestParam(required = false) Long deviceId,
            @RequestParam(defaultValue = "30") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        // Detect fill/drain events from position history using totalDistance delta
        // Fill = battery/level jumps up significantly; drain = drops significantly
        // For EV: watch io113 (battery %); for ICE: watch fuel level AVL if available
        String deviceFilter = deviceId != null ? "AND p.deviceid = " + deviceId : "";

        var events = db.queryForList(
            "WITH hourly AS (" +
            "  SELECT p.deviceid, d.name, d.powertrain, " +
            "    date_trunc('hour', p.fixtime) as hour, " +
            "    AVG((p.attributes::jsonb->>'io113')::float) as avg_battery, " +
            "    MIN((p.attributes::jsonb->>'io113')::float) as min_battery, " +
            "    MAX((p.attributes::jsonb->>'io113')::float) as max_battery " +
            "  FROM tc_positions p " +
            "  JOIN tc_devices d ON d.id = p.deviceid " +
            "  WHERE d.tenant_id = ?::uuid " + deviceFilter +
            "  AND p.fixtime > NOW() - ('" + days + " days')::INTERVAL " +
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
            "  avg_battery, min_battery, max_battery, delta, " +
            "  CASE WHEN delta > 5 THEN 'charge' " +
            "       WHEN delta < -5 THEN 'discharge' " +
            "       ELSE 'normal' END as event_type " +
            "FROM deltas " +
            "WHERE ABS(COALESCE(delta,0)) > 5 " +
            "ORDER BY hour DESC LIMIT 100",
            ctx.tenantId);

        return ResponseEntity.ok(Map.of("data", events, "days", days));
    }

    // GET /api/v1/fuel/device/{id}/tank — current tank/battery state
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
