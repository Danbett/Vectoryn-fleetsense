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

    // ── GET /api/v1/telemetry/live ─────────────────────────────────────────
    // The signature live query — device + latest position + computed status
    @GetMapping("/live")
    public ResponseEntity<?> live(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("ops.map")) return ResponseEntity.status(403).build();

        // Build group scope SQL fragment
        String groupJoin = ctx.hasGroupScope()
            ? "JOIN asset_group_members agm ON agm.device_id = d.id " +
              "AND agm.group_id = ANY(?::uuid[]) "
            : "";

        String sql =
            "SELECT " +
            "  d.id, d.uniqueid, d.name, d.tenant_id, " +
            "  d.asset_type, d.asset_code, d.powertrain, d.make, d.model, " +
            "  d.plate_no, d.icon_key, d.color_hex, d.status AS device_status, " +
            "  d.category, d.disabled, " +
            "  p.latitude, p.longitude, p.course, p.speed, p.altitude, " +
            "  p.fixtime, p.servertime, p.attributes, " +
            "  p.address, " +
            "  CASE WHEN d.lastupdate > NOW() - INTERVAL '5 minutes' " +
            "    THEN 'online' ELSE 'offline' END AS connectivity, " +
            "  CASE " +
            "    WHEN d.lastupdate > NOW() - INTERVAL '5 minutes' AND p.speed > 2 THEN 'moving' " +
            "    WHEN d.lastupdate > NOW() - INTERVAL '5 minutes' AND p.speed <= 2 THEN 'idle' " +
            "    ELSE 'offline' END AS map_status " +
            "FROM tc_devices d " +
            groupJoin +
            "LEFT JOIN tc_positions p ON p.id = d.positionid " +
            "WHERE d.tenant_id = ?::uuid " +
            "  AND (d.status IS NULL OR d.status != 'retired') " +
            "ORDER BY d.name";

        List<Object> params = new ArrayList<>();
        if (ctx.hasGroupScope()) params.add(ctx.allowedGroupIds.toArray(new String[0]));
        params.add(ctx.tenantId);

        var devices = db.queryForList(sql, params.toArray());

        // Parse attributes JSONB for each device
        for (var device : devices) {
            String attrs = (String) device.get("attributes");
            if (attrs != null && !attrs.isBlank()) {
                try {
                    device.put("attributes", new com.fasterxml.jackson.databind
                        .ObjectMapper().readValue(attrs, Map.class));
                } catch (Exception e) {
                    device.put("attributes", Map.of());
                }
            } else {
                device.put("attributes", Map.of());
            }
        }

        return ResponseEntity.ok(Map.of(
            "data", devices,
            "count", devices.size(),
            "ts", System.currentTimeMillis()
        ));
    }

    // ── GET /api/v1/telemetry/device/{id}/history ─────────────────────────
    @GetMapping("/device/{id}/history")
    public ResponseEntity<?> history(@PathVariable String id,
                                      @RequestParam(defaultValue = "1") int hours,
                                      HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("ops.trips")) return ResponseEntity.status(403).build();

        // Verify device belongs to tenant
        var check = db.queryForList(
            "SELECT id FROM tc_devices WHERE id = ? AND tenant_id = ?::uuid",
            Long.parseLong(id), ctx.tenantId);
        if (check.isEmpty()) return ResponseEntity.status(404).build();

        var positions = db.queryForList(
            "SELECT id, latitude, longitude, course, speed, fixtime, attributes " +
            "FROM tc_positions " +
            "WHERE deviceid = ? AND fixtime > NOW() - (? * INTERVAL '1 hour') " +
            "ORDER BY fixtime ASC LIMIT 5000",
            Long.parseLong(id), hours);

        return ResponseEntity.ok(Map.of("data", positions, "count", positions.size()));
    }

    // ── GET /api/v1/telemetry/device/{id}/raw ─────────────────────────────
    // Telemetry Explorer — raw AVL messages with calibration
    @GetMapping("/device/{id}/raw")
    public ResponseEntity<?> raw(@PathVariable String id,
                                  @RequestParam(defaultValue = "1") int hours,
                                  @RequestParam(required = false) String avlIds,
                                  HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("explorer")) return ResponseEntity.status(403).build();

        var positions = db.queryForList(
            "SELECT p.id, p.fixtime, p.servertime, p.latitude, p.longitude, " +
            "p.speed, p.course, p.attributes " +
            "FROM tc_positions p " +
            "JOIN tc_devices d ON d.id = p.deviceid " +
            "WHERE p.deviceid = ? AND d.tenant_id = ?::uuid " +
            "AND p.fixtime > NOW() - (? * INTERVAL '1 hour') " +
            "ORDER BY p.fixtime DESC LIMIT 1000",
            Long.parseLong(id), ctx.tenantId, hours);

        return ResponseEntity.ok(Map.of("data", positions, "count", positions.size()));
    }

    // ── GET /api/v1/telemetry/stats ───────────────────────────────────────
    @GetMapping("/stats")
    public ResponseEntity<?> stats(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        var row = db.queryForMap(
            "SELECT " +
            "  COUNT(*) as total, " +
            "  COUNT(*) FILTER (WHERE lastupdate > NOW() - INTERVAL '5 minutes') as online, " +
            "  COUNT(*) FILTER (WHERE lastupdate > NOW() - INTERVAL '5 minutes' " +
            "    AND positionid IS NOT NULL) as active " +
            "FROM tc_devices WHERE tenant_id = ?::uuid", ctx.tenantId);

        return ResponseEntity.ok(Map.of("data", row));
    }
}
