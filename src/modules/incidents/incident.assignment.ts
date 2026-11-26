import type { AuthenticatedUser } from "../../types/auth.types.js";
import { HttpError } from "../../utils/http-error.js";

type IncidentReporter = Pick<AuthenticatedUser, "id" | "role">;

export function resolveIncidentCoordinatorAssignment(
  reporter: IncidentReporter,
  requestedCoordinator?: string,
): string | null {
  if (
    requestedCoordinator &&
    reporter.role !== "system_admin" &&
    reporter.role !== "emergency_coordinator"
  ) {
    throw new HttpError(
      403,
      "Only coordinators can assign an incident coordinator",
    );
  }
  return requestedCoordinator ??
    (reporter.role === "emergency_coordinator" ? reporter.id : null);
}
