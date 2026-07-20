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
@RequestMapping("/api/v1/geofences")
public class GeofencesController {

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
            "SELECT g.id, g.name, g.zone_type, g.coordinates::text, g.radius_m, " +
            "g.speed_limit, g.alert_on_enter, g.alert_on_exit, g.color, g.created_at, " +
            "COUNT(e.id) as event_count " +
            "FROM geo_zones g " +
            "LEFT JOIN geo_zone_events e ON e.zone_id = g.id " +
            "  AND e.fixtime > NOW() - INTERVAL '7 days' " +
            "WHERE g.tenant_id = ?::uuid " +
            "GROUP BY g.id ORDER BY g.name",
            ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", rows));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String,Object> body, HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canEdit("ops.geo")) return ResponseEntity.status(403).build();

        String name = body.getOrDefault("name","").toString().trim();
        if (name.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error","name required"));

        String coords = body.getOrDefault("coordinates","[]").toString();
        Double radius = body.get("radiusM") != null
            ? Double.parseDouble(body.get("radiusM").toString()) : null;
        Double speedLimit = body.get("speedLimit") != null
            ? Double.parseDouble(body.get("speedLimit").toString()) : null;

        try {
            var keys = db.queryForList(
                "INSERT INTO geo_zones (tenant_id, name, zone_type, coordinates, radius_m, " +
                "speed_limit, alert_on_enter, alert_on_exit, color) " +
                "VALUES (?::uuid, ?, ?, ?::jsonb, ?, ?, ?, ?, ?) RETURNING id::text",
                ctx.tenantId, name,
                body.getOrDefault("zoneType","circle").toString(),
                coords, radius, speedLimit,
                Boolean.parseBoolean(body.getOrDefault("alertOnEnter","true").toString()),
                Boolean.parseBoolean(body.getOrDefault("alertOnExit","true").toString()),
                body.getOrDefault("color","#0D7377").toString());
            return ResponseEntity.ok(Map.of("ok", true,
                "id", keys.isEmpty() ? "" : keys.get(0).get("id")));
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
        if (!ctx.canEdit("ops.geo")) return ResponseEntity.status(403).build();

        String coords = body.getOrDefault("coordinates","[]").toString();
        Double radius = body.get("radiusM") != null
            ? Double.parseDouble(body.get("radiusM").toString()) : null;

        db.update(
            "UPDATE geo_zones SET name=?, coordinates=?::jsonb, radius_m=?, " +
            "speed_limit=?, alert_on_enter=?, alert_on_exit=?, color=? " +
            "WHERE id=?::uuid AND tenant_id=?::uuid",
            body.getOrDefault("name",""), coords, radius,
            body.get("speedLimit") != null ? Double.parseDouble(body.get("speedLimit").toString()) : null,
            Boolean.parseBoolean(body.getOrDefault("alertOnEnter","true").toString()),
            Boolean.parseBoolean(body.getOrDefault("alertOnExit","true").toString()),
            body.getOrDefault("color","#0D7377"),
            id, ctx.tenantId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canDelete("ops.geo")) return ResponseEntity.status(403).build();
        db.update("DELETE FROM geo_zones WHERE id=?::uuid AND tenant_id=?::uuid",
            id, ctx.tenantId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/events")
    public ResponseEntity<?> events(
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(required = false) String zoneId,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        String zoneFilter = zoneId != null ? "AND e.zone_id = '" + zoneId + "'::uuid " : "";
        var rows = db.queryForList(
            "SELECT e.id, e.event_type, e.fixtime, e.dwell_s, " +
            "g.name as zone_name, g.color, " +
            "d.name as device_name, d.powertrain " +
            "FROM geo_zone_events e " +
            "JOIN geo_zones g ON g.id = e.zone_id " +
            "JOIN tc_devices d ON d.id = e.device_id " +
            "WHERE g.tenant_id = ?::uuid " + zoneFilter +
            "AND e.fixtime > NOW() - ('" + days + " days')::INTERVAL " +
            "ORDER BY e.fixtime DESC LIMIT 200",
            ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", rows));
    }

    // Check if devices are currently inside any geofence
    @GetMapping("/check")
    public ResponseEntity<?> check(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        var zones = db.queryForList(
            "SELECT id::text, name, zone_type, coordinates::text, radius_m " +
            "FROM geo_zones WHERE tenant_id = ?::uuid", ctx.tenantId);

        var devices = db.queryForList(
            "SELECT d.id, d.name, p.latitude, p.longitude " +
            "FROM tc_devices d " +
            "JOIN tc_positions p ON p.id = d.positionid " +
            "WHERE d.tenant_id = ?::uuid AND p.latitude IS NOT NULL",
            ctx.tenantId);

        return ResponseEntity.ok(Map.of("zones", zones, "devices", devices));
    }
}
