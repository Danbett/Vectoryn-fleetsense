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

    @GetMapping("/device/{deviceId}")
    public ResponseEntity<?> deviceTrips(
            @PathVariable long deviceId,
            @RequestParam(defaultValue = "30") int days,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        var check = db.queryForList(
            "SELECT id, name, powertrain FROM tc_devices WHERE id = ? AND tenant_id = ?::uuid",
            deviceId, ctx.tenantId);
        if (check.isEmpty()) return ResponseEntity.status(404).build();

        // Step 1: get all positions with gap markers
        var positions = db.queryForList(
            "SELECT fixtime, latitude, longitude, speed, " +
            "EXTRACT(EPOCH FROM (fixtime - LAG(fixtime) OVER (ORDER BY fixtime))) as gap_s " +
            "FROM tc_positions WHERE deviceid = ? " +
            "AND fixtime > NOW() - (? * INTERVAL '1 day') " +
            "ORDER BY fixtime",
            deviceId, days);

        // Step 2: group into trips in Java (gap > 5 min = new trip)
        List<Map<String,Object>> trips = new ArrayList<>();
        if (!positions.isEmpty()) {
            List<Map<String,Object>> current = new ArrayList<>();
            for (var pos : positions) {
                Object gap = pos.get("gap_s");
                double gapSecs = gap != null ? Double.parseDouble(gap.toString()) : 0;
                if (!current.isEmpty() && gapSecs > 300) {
                    if (current.size() > 2) trips.add(0, summarize(current));
                    current = new ArrayList<>();
                }
                current.add(pos);
            }
            if (current.size() > 2) trips.add(0, summarize(current));
        }

        int total = trips.size();
        int from = Math.min(page * size, total);
        int to = Math.min(from + size, total);
        List<Map<String,Object>> paged = trips.subList(from, to);

        return ResponseEntity.ok(Map.of(
            "data", paged,
            "total", total,
            "device", check.get(0),
            "page", page,
            "size", size
        ));
    }

    private Map<String,Object> summarize(List<Map<String,Object>> pos) {
        Map<String,Object> trip = new LinkedHashMap<>();
        var first = pos.get(0);
        var last = pos.get(pos.size()-1);

        double maxSpeed = 0, totalDist = 0;
        double prevLat = 0, prevLon = 0;
        for (int i = 0; i < pos.size(); i++) {
            var p = pos.get(i);
            double spd = p.get("speed") != null ? Double.parseDouble(p.get("speed").toString()) : 0;
            double lat = p.get("latitude") != null ? Double.parseDouble(p.get("latitude").toString()) : 0;
            double lon = p.get("longitude") != null ? Double.parseDouble(p.get("longitude").toString()) : 0;
            if (spd > maxSpeed) maxSpeed = spd;
            if (i > 0) totalDist += haversine(prevLat, prevLon, lat, lon);
            prevLat = lat; prevLon = lon;
        }

        trip.put("start_time", first.get("fixtime"));
        trip.put("end_time", last.get("fixtime"));
        trip.put("position_count", pos.size());
        trip.put("max_speed_kmh", Math.round(maxSpeed * 10.0) / 10.0);
        trip.put("distance_km", Math.round(totalDist * 10.0) / 10.0);
        trip.put("start_lat", first.get("latitude"));
        trip.put("start_lon", first.get("longitude"));
        trip.put("end_lat", last.get("latitude"));
        trip.put("end_lon", last.get("longitude"));

        // Duration
        try {
            java.time.Instant t1 = java.time.Instant.parse(first.get("fixtime").toString().replace(" ","T")+"Z");
            java.time.Instant t2 = java.time.Instant.parse(last.get("fixtime").toString().replace(" ","T")+"Z");
            trip.put("duration_s", t2.getEpochSecond() - t1.getEpochSecond());
        } catch (Exception e) { trip.put("duration_s", 0); }

        return trip;
    }

    @GetMapping("/device/{deviceId}/replay")
    public ResponseEntity<?> replay(
            @PathVariable long deviceId,
            @RequestParam String from,
            @RequestParam String to,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

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

    @GetMapping("/summary")
    public ResponseEntity<?> summary(
            @RequestParam(defaultValue = "7") int days,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        var rows = db.queryForList(
            "SELECT d.id, d.name, d.powertrain, d.plate_no, " +
            "COUNT(p.id) as position_count, " +
            "MIN(p.fixtime) as first_seen, MAX(p.fixtime) as last_seen, " +
            "MAX(p.speed) as max_speed " +
            "FROM tc_devices d LEFT JOIN tc_positions p ON p.deviceid = d.id " +
            "AND p.fixtime > NOW() - (? * INTERVAL '1 day') " +
            "WHERE d.tenant_id = ?::uuid " +
            "GROUP BY d.id, d.name, d.powertrain, d.plate_no ORDER BY position_count DESC",
            days, ctx.tenantId);
        return ResponseEntity.ok(Map.of("data", rows, "days", days));
    }

    private double toDouble(Object o) {
        if (o == null) return 0;
        try { return Double.parseDouble(o.toString()); } catch (Exception e) { return 0; }
    }

    private double haversine(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat/2)*Math.sin(dLat/2) +
                   Math.cos(Math.toRadians(lat1))*Math.cos(Math.toRadians(lat2))*
                   Math.sin(dLon/2)*Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
}
