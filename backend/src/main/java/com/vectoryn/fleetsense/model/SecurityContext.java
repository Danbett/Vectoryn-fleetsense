package com.vectoryn.fleetsense.model;

import java.util.*;

public class SecurityContext {
    public final String userId;
    public final String tenantId;
    public final String email;
    public final String name;
    public final boolean isSuperAdmin;
    public final Map<String, Integer> permissions; // module_key → bitmask (1=view,2=edit,4=delete,8=export)
    public final Set<String> allowedGroupIds;       // empty = all groups

    public SecurityContext(String userId, String tenantId, String email, String name,
                           boolean isSuperAdmin, Map<String, Integer> permissions,
                           Set<String> allowedGroupIds) {
        this.userId          = userId;
        this.tenantId        = tenantId;
        this.email           = email;
        this.name            = name;
        this.isSuperAdmin    = isSuperAdmin;
        this.permissions     = permissions;
        this.allowedGroupIds = allowedGroupIds;
    }

    public boolean canView(String moduleKey) {
        if (isSuperAdmin) return true;
        return (permissions.getOrDefault(moduleKey, 0) & 1) != 0;
    }

    public boolean canEdit(String moduleKey) {
        if (isSuperAdmin) return true;
        return (permissions.getOrDefault(moduleKey, 0) & 2) != 0;
    }

    public boolean canDelete(String moduleKey) {
        if (isSuperAdmin) return true;
        return (permissions.getOrDefault(moduleKey, 0) & 4) != 0;
    }

    public boolean canExport(String moduleKey) {
        if (isSuperAdmin) return true;
        return (permissions.getOrDefault(moduleKey, 0) & 8) != 0;
    }

    public boolean hasGroupScope() {
        return !allowedGroupIds.isEmpty();
    }
}
