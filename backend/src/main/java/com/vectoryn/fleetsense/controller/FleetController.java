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
@RequestMapping("/api/v1/fleet")
public class FleetController {

    @Autowired private JdbcTemplate db;
    @Autowired private AuthService auth;

    private SecurityContext ctx(HttpServletRequest req) {
        return auth.resolve(req.getHeader("X-Session-Token"), req.getHeader("X-Api-Key"));
    }

    // ── GET /api/v1/fleet/devices ─────────────────────────────────────────
    @GetMapping("/devices")
    public ResponseEntity<?> listDevices(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type,
            HttpServletRequest req) {

        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("fleet")) return ResponseEntity.status(403).build();

        StringBuilder sql = new StringBuilder(
            "SELECT d.id, d.uniqueid, d.name, d.tenant_id, d.asset_code, " +
            "d.asset_type, d.powertrain, d.make, d.model, d.year, d.plate_no, " +
            "d.fuel_type, d.tank_capacity_l, d.ev_pack_kwh, d.terminal_model, " +
            "d.icon_key, d.color_hex, d.status, d.category, d.disabled, " +
            "d.lastupdate, d.positionid " +
            "FROM tc_devices d WHERE d.tenant_id = ?::uuid ");

        List<Object> params = new ArrayList<>();
        params.add(ctx.tenantId);

        if (status != null && !status.isBlank()) {
            sql.append("AND d.status = ? ");
            params.add(status);
        }
        if (type != null && !type.isBlank()) {
            sql.append("AND d.asset_type = ? ");
            params.add(type);
        }
        if (ctx.hasGroupScope()) {
            sql.append("AND EXISTS (SELECT 1 FROM asset_group_members m " +
                "WHERE m.device_id = d.id AND m.group_id = ANY(?::uuid[])) ");
            params.add(ctx.allowedGroupIds.toArray(new String[0]));
        }

        sql.append("ORDER BY d.name LIMIT ? OFFSET ?");
        params.add(size);
        params.add(page * size);

        var devices = db.queryForList(sql.toString(), params.toArray());

        // Count
        var countSql = "SELECT COUNT(*) FROM tc_devices d WHERE d.tenant_id = ?::uuid";
        long total = db.queryForObject(countSql, Long.class, ctx.tenantId);

        return ResponseEntity.ok(Map.of(
            "data", devices,
            "total", total,
            "page", page,
            "size", size
        ));
    }

    // ── PUT /api/v1/fleet/devices/{id} ────────────────────────────────────
    @PutMapping("/devices/{id}")
    public ResponseEntity<?> updateDevice(@PathVariable long id,
                                           @RequestBody Map<String, Object> body,
                                           HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canEdit("fleet")) return ResponseEntity.status(403).build();

        // Verify ownership
        var check = db.queryForList(
            "SELECT id FROM tc_devices WHERE id = ? AND tenant_id = ?::uuid",
            id, ctx.tenantId);
        if (check.isEmpty()) return ResponseEntity.status(404).build();

        db.update(
            "UPDATE tc_devices SET " +
            "asset_code = ?, asset_type = ?, powertrain = ?, make = ?, " +
            "model = ?, year = ?, plate_no = ?, fuel_type = ?, " +
            "tank_capacity_l = ?, ev_pack_kwh = ?, terminal_model = ?, " +
            "icon_key = ?, color_hex = ? WHERE id = ?",
            body.get("assetCode"), body.get("assetType"),
            body.getOrDefault("powertrain", "ice"), body.get("make"),
            body.get("model"),
            body.get("year") != null ? Integer.parseInt(body.get("year").toString()) : null,
            body.get("plateNo"), body.get("fuelType"),
            body.get("tankCapacityL") != null
                ? Double.parseDouble(body.get("tankCapacityL").toString()) : null,
            body.get("evPackKwh") != null
                ? Double.parseDouble(body.get("evPackKwh").toString()) : null,
            body.get("terminalModel"),
            body.getOrDefault("iconKey", "truck"),
            body.getOrDefault("colorHex", "2E5FA3"),
            id);

        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ── POST /api/v1/fleet/devices/{id}/assign-tenant ─────────────────────
    // Assign a Traccar device (by uniqueId) to this tenant
    @PostMapping("/devices/assign")
    public ResponseEntity<?> assignDevice(@RequestBody Map<String, Object> body,
                                           HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canEdit("fleet")) return ResponseEntity.status(403).build();

        String uniqueId = body.getOrDefault("uniqueId", "").toString().trim();
        if (uniqueId.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "uniqueId required"));

        var check = db.queryForList(
            "SELECT id, tenant_id FROM tc_devices WHERE uniqueid = ?", uniqueId);
        if (check.isEmpty())
            return ResponseEntity.status(404)
                .body(Map.of("error", "Device not found — has it connected yet?"));

        var dev = check.get(0);
        if (dev.get("tenant_id") != null && !ctx.isSuperAdmin)
            return ResponseEntity.status(409)
                .body(Map.of("error", "Device already assigned to a tenant"));

        db.update("UPDATE tc_devices SET tenant_id = ?::uuid WHERE uniqueid = ?",
            ctx.tenantId, uniqueId);

        return ResponseEntity.ok(Map.of("ok", true, "deviceId", dev.get("id")));
    }

    // ── GET /api/v1/fleet/groups ──────────────────────────────────────────
    @GetMapping("/groups")
    public ResponseEntity<?> listGroups(HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();
        if (!ctx.canView("fleet")) return ResponseEntity.status(403).build();

        var groups = db.queryForList(
            "SELECT ag.id, ag.name, ag.description, " +
            "COUNT(agm.device_id) as device_count " +
            "FROM asset_groups ag " +
            "LEFT JOIN asset_group_members agm ON agm.group_id = ag.id " +
            "WHERE ag.tenant_id = ?::uuid " +
            "GROUP BY ag.id, ag.name, ag.description ORDER BY ag.name",
            ctx.tenantId);

        return ResponseEntity.ok(Map.of("data", groups));
    }

    // ── GET /api/v1/fleet/avl-params ─────────────────────────────────────
    @GetMapping("/avl-params")
    public ResponseEntity<?> avlParams(
            @RequestParam(required = false) String group,
            HttpServletRequest req) {
        var ctx = ctx(req);
        if (ctx == null) return ResponseEntity.status(401).build();

        String sql = group != null
            ? "SELECT * FROM avl_parameters WHERE param_group = ? ORDER BY avl_id"
            : "SELECT * FROM avl_parameters ORDER BY avl_id";

        var params = group != null
            ? db.queryForList(sql, group)
            : db.queryForList(sql);

        return ResponseEntity.ok(Map.of("data", params));
    }
}
