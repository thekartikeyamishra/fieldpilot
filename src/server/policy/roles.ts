export const ROLES = ["admin", "supervisor", "technician"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "asset:read"
  | "asset:write"
  | "incident:create"
  | "measurement:create"
  | "work_order:create"
  | "work_order:update"
  | "work_order:close"
  | "voice:use"
  | "audit:read"
  | "org:manage"
  | "data:export";

const MATRIX: Record<Role, Permission[]> = {
  admin: [
    "asset:read", "asset:write", "incident:create", "measurement:create",
    "work_order:create", "work_order:update", "work_order:close",
    "voice:use", "audit:read", "org:manage", "data:export",
  ],
  supervisor: [
    "asset:read", "asset:write", "incident:create", "measurement:create",
    "work_order:create", "work_order:update", "work_order:close",
    "voice:use", "audit:read", "data:export",
  ],
  technician: [
    "asset:read", "incident:create", "measurement:create",
    "work_order:create", "work_order:update", "voice:use",
  ],
};

export const can = (role: Role, permission: Permission): boolean =>
  (MATRIX[role] ?? []).includes(permission);

export const permissionsFor = (role: Role): Permission[] => MATRIX[role] ?? [];
