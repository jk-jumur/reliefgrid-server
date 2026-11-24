
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";

import { client, db } from "./database.js";

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

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

  trustedOrigins: [CLIENT_URL],

  emailAndPassword: {
    enabled: true,
  },

  plugins: [
    jwt(),
  ],
});
