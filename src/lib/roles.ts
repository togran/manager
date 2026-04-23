import type { UserRole } from "@/lib/db";

const VALID_ROLES: UserRole[] = ["admin", "user"];

export function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && VALID_ROLES.includes(value as UserRole);
}

export function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isValidRole(normalized) ? normalized : null;
}

export function assertRole(value: unknown): UserRole {
  const role = normalizeRole(value);
  if (!role) {
    throw new Error("Invalid role. Allowed values are: admin, user");
  }
  return role;
}
