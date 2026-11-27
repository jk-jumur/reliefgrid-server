import type { Request } from "express";
import type { AuthenticatedUser } from "./auth.types.js";

export type ExtendedRequest = Request & {
  user?: AuthenticatedUser;
  validatedQuery?: unknown;
};