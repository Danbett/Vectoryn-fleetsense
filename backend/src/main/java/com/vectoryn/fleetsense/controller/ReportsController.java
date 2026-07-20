package com.vectoryn.fleetsense.controller;

import com.vectoryn.fleetsense.auth.AuthService;
import com.vectoryn.fleetsense.model.SecurityContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import java.io.*;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportsController {

    @Autowired private JdbcTemplate db;
    @Autowired private AuthService auth;

    private SecurityContext ctx(HttpServletRequest req) {
        return auth.resolve(req.getHeader("X-Session-Token"), req.getHeader("X-Api-Key"));
    }

    // GET /api/v1/reports/fleet-summary — daily fleet summary
    @GetMapping("/fleet-summary")
    public ResponseEntity<?> fleetSummary(
            @RequestParam(defaultValue = "7") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        var rows = db.queryForList(
            "SELECT d.id, d.name, d.powertrain, d.plate_no, d.asset_type, " +
            "d.make, d.model, d.terminal_model, " +
            "COUNT(p.id) as position_count, " +
            "MAX(p.speed) as max_speed, " +
            "AVG(p.speed) FILTER (WHERE p.speed > 0) as avg_speed, " +
            "MIN(p.fixtime) as first_fix, MAX(p.fixtime) as last_fix, " +
            "d.lastupdate " +
            "FROM tc_devices d " +
            "LEFT JOIN tc_positions p ON p.deviceid = d.id " +
            "  AND p.fixtime > NOW() - ('" + days + " days')::INTERVAL " +
            "WHERE d.tenant_id = ?::uuid " +
            "GROUP BY d.id ORDER BY d.name",
            ctx.tenantId);

        // Enrich with distance and engine hours from AVL data
        List<Map<String,Object>> enriched = new ArrayList<>();
        for (var row : rows) {
            Map<String,Object> r = new LinkedHashMap<>(row);
            long devId = ((Number)row.get("id")).longValue();
            try {
                var avl = db.queryForList(
                    "SELECT " +
                    "  MAX((attributes::jsonb->>'totalDistance')::float) - " +
                    "  MIN((attributes::jsonb->>'totalDistance')::float) as dist_m, " +
                    "  MAX((attributes::jsonb->>'hours')::float) - " +
                    "  MIN((attributes::jsonb->>'hours')::float) as eng_ms " +
                    "FROM tc_positions " +
                    "WHERE deviceid = ? " +
                    "AND fixtime > NOW() - ('" + days + " days')::INTERVAL " +
                    "AND attributes::jsonb ? 'totalDistance'", devId);
                if (!avl.isEmpty() && avl.get(0).get("dist_m") != null) {
                    double d = Math.max(0, ((Number)avl.get(0).get("dist_m")).doubleValue() / 1000.0);
                    r.put("distance_km", Math.round(d * 10.0) / 10.0);
                    Object em = avl.get(0).get("eng_ms");
                    if (em != null) r.put("engine_h", Math.round(Math.max(0,
                        ((Number)em).doubleValue() / 3600000.0) * 10.0) / 10.0);
                } else { r.put("distance_km", 0); r.put("engine_h", 0); }
            } catch (Exception e) { r.put("distance_km", 0); r.put("engine_h", 0); }
            enriched.add(r);
        }

        return ResponseEntity.ok(Map.of(
            "data", enriched,
            "days", days,
            "generated_at", java.time.Instant.now().toString(),
            "tenant", db.queryForList("SELECT name FROM tenants WHERE id=?::uuid",
                ctx.tenantId).stream().findFirst().map(t->t.get("name")).orElse("Unknown")
        ));
    }

    // GET /api/v1/reports/device-history — per device trip history
    @GetMapping("/device-history")
    public ResponseEntity<?> deviceHistory(
            @RequestParam long deviceId,
            @RequestParam(defaultValue = "30") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        var check = db.queryForList(
            "SELECT id, name FROM tc_devices WHERE id=? AND tenant_id=?::uuid",
            deviceId, ctx.tenantId);
        if (check.isEmpty()) return ResponseEntity.status(404).build();

        var positions = db.queryForList(
            "SELECT fixtime, latitude, longitude, speed, course, attributes " +
            "FROM tc_positions WHERE deviceid=? " +
            "AND fixtime > NOW() - ('" + days + " days')::INTERVAL " +
            "ORDER BY fixtime DESC LIMIT 5000",
            deviceId);

        return ResponseEntity.ok(Map.of(
            "device", check.get(0),
            "data", positions,
            "count", positions.size()
        ));
    }

    // GET /api/v1/reports/export/csv — CSV export of fleet summary
    @GetMapping("/export/csv")
    public ResponseEntity<byte[]> exportCsv(
            @RequestParam(defaultValue = "7") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canExport("reports")) return ResponseEntity.status(403).build();

        var rows = db.queryForList(
            "SELECT d.name, d.plate_no, d.powertrain, d.make, d.model, " +
            "d.terminal_model, d.asset_type, " +
            "COUNT(p.id) as positions, " +
            "ROUND(MAX(p.speed)::numeric,1) as max_speed_kmh, " +
            "ROUND(AVG(p.speed) FILTER (WHERE p.speed>0)::numeric,1) as avg_speed_kmh, " +
            "MIN(p.fixtime) as first_fix, MAX(p.fixtime) as last_fix " +
            "FROM tc_devices d " +
            "LEFT JOIN tc_positions p ON p.deviceid=d.id " +
            "  AND p.fixtime > NOW() - ('" + days + " days')::INTERVAL " +
            "WHERE d.tenant_id=?::uuid GROUP BY d.id ORDER BY d.name",
            ctx.tenantId);

        StringBuilder csv = new StringBuilder();
        csv.append("Asset Name,Plate No.,Powertrain,Make,Model,Terminal,Type,")
           .append("Positions,Max Speed (km/h),Avg Speed (km/h),First Fix,Last Fix\n");

        for (var row : rows) {
            csv.append(esc(row.get("name"))).append(",")
               .append(esc(row.get("plate_no"))).append(",")
               .append(esc(row.get("powertrain"))).append(",")
               .append(esc(row.get("make"))).append(",")
               .append(esc(row.get("model"))).append(",")
               .append(esc(row.get("terminal_model"))).append(",")
               .append(esc(row.get("asset_type"))).append(",")
               .append(row.getOrDefault("positions","0")).append(",")
               .append(row.getOrDefault("max_speed_kmh","0")).append(",")
               .append(row.getOrDefault("avg_speed_kmh","0")).append(",")
               .append(esc(row.get("first_fix"))).append(",")
               .append(esc(row.get("last_fix"))).append("\n");
        }

        byte[] bytes = csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"fleet-report-" + days + "d.csv\"")
            .header(HttpHeaders.CONTENT_TYPE, "text/csv; charset=UTF-8")
            .body(bytes);
    }

    private String esc(Object v) {
        if (v == null) return "";
        String s = v.toString();
        if (s.contains(",") || s.contains("\"") || s.contains("\n"))
            return "\"" + s.replace("\"","\"\"") + "\"";
        return s;
    }
}
