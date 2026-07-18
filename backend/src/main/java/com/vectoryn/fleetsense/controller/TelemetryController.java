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
@RequestMapping("/api/v1/telemetry")
public class TelemetryController {

    @Autowired private JdbcTemplate db;
    @Autowired private AuthService auth;

    private SecurityContext ctx(HttpServletRequest req) {
        return auth.resolve(req.getHeader("X-Session-Token"), req.getHeader("X-Api-Key"));
    }

    @GetMapping("/live")
    public ResponseEntity<?> live(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("ops.map")) return ResponseEntity.status(403).build();

        String groupJoin = ctx.hasGroupScope()
            ? "JOIN asset_group_members agm ON agm.device_id = d.id AND agm.group_id = ANY(?::uuid[]) " : "";

        String sql =
            "SELECT d.id, d.uniqueid, d.name, d.tenant_id::text, " +
            "d.asset_type, d.asset_code, d.powertrain, d.make, d.model, " +
            "d.plate_no, d.icon_key, d.color_hex, d.category, d.disabled, " +
            "d.status AS device_status, " +
            "p.latitude, p.longitude, p.course, p.speed, p.altitude, " +
            "p.fixtime, p.servertime, p.attributes, p.address, " +
            "CASE WHEN d.lastupdate::timestamptz > NOW() - INTERVAL '5 minutes' " +
            "  THEN 'online' ELSE 'offline' END AS connectivity, " +
            "CASE " +
            "  WHEN d.lastupdate::timestamptz > NOW() - INTERVAL '5 minutes' " +
            "    AND COALESCE(p.speed,0) > 2 THEN 'moving' " +
            "  WHEN d.lastupdate::timestamptz > NOW() - INTERVAL '5 minutes' THEN 'idle' " +
            "  ELSE 'offline' END AS map_status " +
            "FROM tc_devices d " + groupJoin +
            "LEFT JOIN tc_positions p ON p.id = d.positionid " +
            "WHERE d.tenant_id = ?::uuid " +
            "  AND COALESCE(d.status,'active') != 'retired' " +
            "ORDER BY d.name";

        List<Object> params = new ArrayList<>();
        if (ctx.hasGroupScope()) params.add(ctx.allowedGroupIds.toArray(new String[0]));
        params.add(ctx.tenantId);

        var devices = db.queryForList(sql, params.toArray());
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        for (var device : devices) {
            String attrs = (String) device.get("attributes");
            try {
                device.put("attributes", attrs != null && !attrs.isBlank()
                    ? mapper.readValue(attrs, Map.class) : Map.of());
            } catch (Exception e) { device.put("attributes", Map.of()); }
        }
        return ResponseEntity.ok(Map.of("data", devices, "count", devices.size(),
            "ts", System.currentTimeMillis()));
    }

    @GetMapping("/stats")
    public ResponseEntity<?> stats(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        var row = db.queryForMap(
            "SELECT " +
            "  COUNT(*) as total, " +
            "  SUM(CASE WHEN lastupdate::timestamptz > NOW() - INTERVAL '5 minutes' " +
            "    THEN 1 ELSE 0 END) as online, " +
            "  SUM(CASE WHEN lastupdate::timestamptz > NOW() - INTERVAL '5 minutes' " +
            "    AND positionid IS NOT NULL THEN 1 ELSE 0 END) as active " +
            "FROM tc_devices WHERE tenant_id = ?::uuid",
            ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", row));
    }

    @GetMapping("/device/{id}/history")
    public ResponseEntity<?> history(@PathVariable long id,
                                      @RequestParam(defaultValue = "24") int hours,
                                      @RequestParam(defaultValue = "0") long before,
                                      HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("ops.trips")) return ResponseEntity.status(403).build();

        var check = db.queryForList(
            "SELECT id FROM tc_devices WHERE id = ? AND tenant_id = ?::uuid",
            id, ctx.tenantId);
        if (check.isEmpty()) return ResponseEntity.status(404).build();

        List<Map<String, Object>> positions;
        if (before > 0) {
            positions = db.queryForList(
                "SELECT id, latitude, longitude, course, speed, fixtime, attributes " +
                "FROM tc_positions WHERE deviceid = ? " +
                "AND fixtime < to_timestamp(?/1000.0) " +
                "ORDER BY fixtime ASC LIMIT 10000",
                id, before);
        } else {
            int h = Math.max(1, Math.min(hours, 720));
            positions = db.queryForList(
                "SELECT id, latitude, longitude, course, speed, fixtime, attributes " +
                "FROM tc_positions WHERE deviceid = ? " +
                "AND fixtime > NOW() - INTERVAL '" + h + " hours' " +
                "ORDER BY fixtime ASC LIMIT 10000",
                id);
        }
        return ResponseEntity.ok(Map.of("data", positions, "count", positions.size()));
    }

    @GetMapping("/device/{id}/raw")
    public ResponseEntity<?> raw(@PathVariable long id,
                                  @RequestParam(defaultValue = "1") int hours,
                                  HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("explorer")) return ResponseEntity.status(403).build();

        int h = Math.max(1, Math.min(hours, 720));
        var positions = db.queryForList(
            "SELECT p.id, p.fixtime, p.servertime, p.latitude, p.longitude, " +
            "p.speed, p.course, p.altitude, p.attributes " +
            "FROM tc_positions p JOIN tc_devices d ON d.id = p.deviceid " +
            "WHERE p.deviceid = ? AND d.tenant_id = ?::uuid " +
            "AND p.fixtime > NOW() - INTERVAL '" + h + " hours' " +
            "ORDER BY p.fixtime DESC LIMIT 2000",
            id, ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", positions, "count", positions.size()));
    }
}
