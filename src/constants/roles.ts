export const USER_ROLES = [
  "citizen",
  "volunteer",
  "relief_organization",
  "emergency_coordinator",
  "shelter_manager",
  "system_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];