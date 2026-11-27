import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";

import { client, db } from "./database.js";
import { USER_ROLES } from "../constants/roles.js";

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const isProduction = process.env.NODE_ENV === "production" || BETTER_AUTH_URL?.startsWith("https://");

if (!BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is missing");
}

if (!BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL is missing");
}

export const auth = betterAuth({
  appName: "ReliefGrid",

  database: mongodbAdapter(db, {
    client,
  }),

  secret: BETTER_AUTH_SECRET,

  baseURL: BETTER_AUTH_URL,

  trustedOrigins: [CLIENT_URL, "https://reliefgrid-client.vercel.app"],

  advanced: {
    defaultCookieAttributes: {
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
    },
  },

  user: {
    additionalFields: {
      role: {
        type: [...USER_ROLES],
        required: false,
        defaultValue: "citizen",
        input: false,
      },

      phone: {
        type: "string",
        required: false,
      },

      organizationId: {
        type: "string",
        required: false,
        input: false,
      },

      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },

  emailAndPassword: {
    enabled: true,
  },

  plugins: [
    jwt({
      jwt: {
        definePayload: ({ user }) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          phone: user.phone ?? null,
          organizationId: user.organizationId ?? null,
          isActive: user.isActive,
        }),
      },
    }),
  ],
});