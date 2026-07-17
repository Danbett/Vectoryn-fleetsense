package com.vectoryn.fleetsense.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@RestController
@RequestMapping("/api/v1/ingest")
public class IngestController {

    private static final Logger log = LoggerFactory.getLogger(IngestController.class);

    @Autowired private JdbcTemplate db;

    // ── SSE emitters per tenant ───────────────────────────────────────────────
    private final Map<String, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    // ── POST /api/v1/ingest/push — called by Traccar forward.url ─────────────
    @PostMapping("/push")
    public ResponseEntity<?> push(@RequestBody Map<String, Object> payload) {
        try {
            String uniqueId = payload.getOrDefault("deviceId", "").toString();
            if (uniqueId.isBlank()) return ResponseEntity.ok(Map.of("ok", true));

            // Look up device in tc_devices to get tenant_id
            var devRows = db.queryForList(
                "SELECT id, tenant_id, name FROM tc_devices WHERE uniqueid = ?", uniqueId);

            if (devRows.isEmpty()) {
                log.debug("Unknown device ping: {}", uniqueId);
                return ResponseEntity.ok(Map.of("ok", true, "status", "unknown_device"));
            }

            var dev = devRows.get(0);
            String tenantId = dev.get("tenant_id") != null
                ? dev.get("tenant_id").toString() : null;

            // Broadcast to SSE subscribers for this tenant
            if (tenantId != null) {
                broadcastPosition(tenantId, payload);
            }

            log.debug("Ingest push: device={} tenant={}", uniqueId, tenantId);
            return ResponseEntity.ok(Map.of("ok", true));

        } catch (Exception e) {
            log.error("Ingest push error: {}", e.getMessage());
            return ResponseEntity.ok(Map.of("ok", true)); // always 200 to Traccar
        }
    }

    // ── GET /api/v1/ingest/stream — SSE stream for live map ──────────────────
    @GetMapping("/stream")
    public SseEmitter stream(@RequestHeader(value = "X-Session-Token", required = false) String token,
                              @RequestHeader(value = "X-Api-Key", required = false) String apiKey) {
        // Basic validation — full auth in TelemetryController
        SseEmitter emitter = new SseEmitter(3_600_000L); // 1 hour timeout

        // For now use "all" as key — Phase 2 scopes per tenant
        emitters.computeIfAbsent("all", k -> new CopyOnWriteArrayList<>()).add(emitter);

        emitter.onCompletion(() -> removeEmitter("all", emitter));
        emitter.onTimeout(()    -> removeEmitter("all", emitter));
        emitter.onError(e   ->  removeEmitter("all", emitter));

        // Send heartbeat immediately
        try {
            emitter.send(SseEmitter.event().name("heartbeat").data("connected"));
        } catch (IOException e) {
            emitter.complete();
        }

        return emitter;
    }

    // ── Broadcast position to all SSE subscribers for a tenant ───────────────
    private void broadcastPosition(String tenantId, Map<String, Object> data) {
        var tenantEmitters = emitters.get("all");
        if (tenantEmitters == null || tenantEmitters.isEmpty()) return;

        List<SseEmitter> dead = new ArrayList<>();
        for (var emitter : tenantEmitters) {
            try {
                emitter.send(SseEmitter.event()
                    .name("position")
                    .data(data));
            } catch (Exception e) {
                dead.add(emitter);
            }
        }
        tenantEmitters.removeAll(dead);
    }

    private void removeEmitter(String tenantId, SseEmitter emitter) {
        var list = emitters.get(tenantId);
        if (list != null) list.remove(emitter);
    }

    // ── GET /api/v1/ingest/ping — simple health check ────────────────────────
    @GetMapping("/ping")
    public ResponseEntity<?> ping() {
        return ResponseEntity.ok(Map.of("ok", true, "ts", System.currentTimeMillis()));
    }
}
