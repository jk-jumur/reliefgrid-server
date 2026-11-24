import type { UserRole } from "../constants/roles.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
  isActive: boolean;
}