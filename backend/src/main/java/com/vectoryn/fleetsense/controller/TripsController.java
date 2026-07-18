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
@RequestMapping("/api/v1/trips")
public class TripsController {

    @Autowired private JdbcTemplate db;
    @Autowired private AuthService auth;

    private SecurityContext ctx(HttpServletRequest req) {
        return auth.resolve(req.getHeader("X-Session-Token"), req.getHeader("X-Api-Key"));
    }

    // GET /api/v1/trips/segments — list trips from tc_positions (computed on the fly)
    // Since trip_segments hypertable may be empty, we compute from positions
    @GetMapping("/device/{deviceId}")
    public ResponseEntity<?> deviceTrips(
            @PathVariable long deviceId,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("ops.trips")) return ResponseEntity.status(403).build();

        // Verify device ownership
        var check = db.queryForList(
            "SELECT id, name, powertrain FROM tc_devices WHERE id = ? AND tenant_id = ?::uuid",
            deviceId, ctx.tenantId);
        if (check.isEmpty()) return ResponseEntity.status(404).build();

        var device = check.get(0);

        // Compute trips from position gaps (gap > 5 min = new trip)
        // Uses window functions to detect trip boundaries
        var trips = db.queryForList(
            "WITH ordered AS (" +
            "  SELECT id, fixtime, latitude, longitude, speed, attributes, " +
            "    LAG(fixtime) OVER (ORDER BY fixtime) as prev_time, " +
            "    LAG(latitude) OVER (ORDER BY fixtime) as prev_lat, " +
            "    LAG(longitude) OVER (ORDER BY fixtime) as prev_lon " +
            "  FROM tc_positions WHERE deviceid = ? " +
            "  AND fixtime > NOW() - (? * INTERVAL '1 day') " +
            "), " +
            "trip_starts AS (" +
            "  SELECT id, fixtime, latitude, longitude, speed, attributes, " +
            "    CASE WHEN prev_time IS NULL OR " +
            "         EXTRACT(EPOCH FROM (fixtime - prev_time)) > 300 " +
            "    THEN 1 ELSE 0 END as is_start " +
            "  FROM ordered " +
            "), " +
            "with_groups AS (" +
            "  SELECT *, SUM(is_start) OVER (ORDER BY fixtime) as trip_num " +
            "  FROM trip_starts " +
            ") " +
            "SELECT " +
            "  trip_num, " +
            "  MIN(fixtime) as start_time, " +
            "  MAX(fixtime) as end_time, " +
            "  COUNT(*) as position_count, " +
            "  MAX(speed) as max_speed_kmh, " +
            "  AVG(speed) as avg_speed_kmh, " +
            "  EXTRACT(EPOCH FROM (MAX(fixtime) - MIN(fixtime))) as duration_s, " +
            "  MIN(latitude) as min_lat, MAX(latitude) as max_lat, " +
            "  MIN(longitude) as min_lon, MAX(longitude) as max_lon, " +
            "  FIRST_VALUE(latitude) OVER (PARTITION BY trip_num ORDER BY fixtime) as start_lat, " +
            "  FIRST_VALUE(longitude) OVER (PARTITION BY trip_num ORDER BY fixtime) as start_lon " +
            "FROM with_groups " +
            "GROUP BY trip_num " +
            "HAVING COUNT(*) > 2 " +
            "ORDER BY start_time DESC " +
            "LIMIT ? OFFSET ?",
            deviceId, days, size, page * size);

        return ResponseEntity.ok(Map.of(
            "data", trips,
            "device", device,
            "page", page,
            "size", size
        ));
    }

    // GET /api/v1/trips/device/{deviceId}/replay — positions for a time window
    @GetMapping("/device/{deviceId}/replay")
    public ResponseEntity<?> replay(
            @PathVariable long deviceId,
            @RequestParam String from,
            @RequestParam String to,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("ops.trips")) return ResponseEntity.status(403).build();

        var check = db.queryForList(
            "SELECT id FROM tc_devices WHERE id = ? AND tenant_id = ?::uuid",
            deviceId, ctx.tenantId);
        if (check.isEmpty()) return ResponseEntity.status(404).build();

        var positions = db.queryForList(
            "SELECT id, fixtime, latitude, longitude, speed, course, altitude, attributes " +
            "FROM tc_positions " +
            "WHERE deviceid = ? AND fixtime BETWEEN ?::timestamptz AND ?::timestamptz " +
            "ORDER BY fixtime ASC LIMIT 10000",
            deviceId, from, to);

        // Compute approximate distance
        double totalDist = 0;
        for (int i = 1; i < positions.size(); i++) {
            double lat1 = toDouble(positions.get(i-1).get("latitude"));
            double lon1 = toDouble(positions.get(i-1).get("longitude"));
            double lat2 = toDouble(positions.get(i).get("latitude"));
            double lon2 = toDouble(positions.get(i).get("longitude"));
            totalDist += haversine(lat1, lon1, lat2, lon2);
        }

        return ResponseEntity.ok(Map.of(
            "data", positions,
            "count", positions.size(),
            "distance_km", Math.round(totalDist * 10.0) / 10.0
        ));
    }

    // GET /api/v1/trips/summary — fleet-wide trip summary
    @GetMapping("/summary")
    public ResponseEntity<?> summary(
            @RequestParam(defaultValue = "7") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("ops.trips")) return ResponseEntity.status(403).build();

        var rows = db.queryForList(
            "SELECT d.id, d.name, d.powertrain, d.plate_no, " +
            "COUNT(p.id) as position_count, " +
            "MIN(p.fixtime) as first_seen, MAX(p.fixtime) as last_seen, " +
            "MAX(p.speed) as max_speed " +
            "FROM tc_devices d " +
            "LEFT JOIN tc_positions p ON p.deviceid = d.id " +
            "  AND p.fixtime > NOW() - (? * INTERVAL '1 day') " +
            "WHERE d.tenant_id = ?::uuid " +
            "GROUP BY d.id, d.name, d.powertrain, d.plate_no " +
            "ORDER BY position_count DESC",
            days, ctx.tenantId);

        return ResponseEntity.ok(Map.of("data", rows, "days", days));
    }

    private double toDouble(Object o) {
        if (o == null) return 0;
        return Double.parseDouble(o.toString());
    }

    private double haversine(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                   Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                   Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
}
