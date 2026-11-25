import "dotenv/config";

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ObjectId } from "mongodb";

interface DemoCredential {
  id: string;
  email: string;
  password: string;
  role: string;
}

interface DemoCredentials {
  accounts: DemoCredential[];
}

const DEMO_DATABASE = "reliefgrid";
const API_URL = (process.env.DEMO_API_URL || "http://localhost:5000").replace(/\/+$/, "");
const CLIENT_ORIGIN = process.env.CLIENT_URL || "http://localhost:3000";

const smokeCases = [
  { role: "system_admin", path: "/api/organizations?limit=1", expectedStatus: 200 },
  { role: "system_admin", path: "/api/admin/configurations", expectedStatus: 200 },
  { role: "emergency_coordinator", path: "/api/analytics/overview?days=30", expectedStatus: 200 },
  { role: "emergency_coordinator", path: "/api/analytics/demand-forecast?lookbackDays=30&horizonDays=7", expectedStatus: 200 },
  { role: "emergency_coordinator", path: "/api/exports/emergency-report.pdf?days=30", expectedStatus: 200, expectedContentType: "application/pdf" },
  { role: "relief_organization", path: "/api/resources?limit=1", expectedStatus: 200 },
  { role: "volunteer", path: "/api/tasks?limit=1", expectedStatus: 200 },
  { role: "volunteer", path: "/api/admin/configurations", expectedStatus: 403 },
  { role: "shelter_manager", path: "/api/shelters?limit=1", expectedStatus: 200 },
  { role: "citizen", path: "/api/emergency-requests?limit=1", expectedStatus: 200 },
] as const;

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo smoke tests cannot be run when NODE_ENV=production");
  }
  if (process.env.MONGODB_DATABASE && process.env.MONGODB_DATABASE !== DEMO_DATABASE) {
    throw new Error(`Set MONGODB_DATABASE=${DEMO_DATABASE} before running the demo smoke test`);
  }
  process.env.MONGODB_DATABASE = DEMO_DATABASE;

  const credentials = JSON.parse(
    await readFile(`${process.cwd()}/.demo-credentials.json`, "utf8")
  ) as DemoCredentials;
  const { client, db } = await import("../src/config/database.js");
  const userIds: string[] = [];
  let smokeVolunteerId: ObjectId | undefined;
  let smokeTaskTitle: string | undefined;

  try {
    const results: Array<{
      role: string;
      path: string;
      status: number;
      contentType?: string;
    }> = [];
    let volunteerToken: string | undefined;
    let coordinatorToken: string | undefined;
    for (const testCase of smokeCases) {
      const account = credentials.accounts.find(({ role }) => role === testCase.role);
      if (!account) throw new Error(`No demo account exists for role ${testCase.role}`);

      const login = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: CLIENT_ORIGIN,
        },
        body: JSON.stringify({
          email: account.email,
          password: account.password,
          rememberMe: false,
        }),
      });
      if (!login.ok) {
        throw new Error(`${testCase.role} login failed with HTTP ${login.status}`);
      }
      userIds.push(account.id);

      const cookies = login.headers.getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; ");
      const tokenResponse = await fetch(`${API_URL}/api/auth/token`, {
        headers: { Cookie: cookies, Origin: CLIENT_ORIGIN },
      });
      if (!tokenResponse.ok) {
        throw new Error(`${testCase.role} JWT exchange failed with HTTP ${tokenResponse.status}`);
      }
      const { token } = await tokenResponse.json() as { token?: string };
      if (!token) throw new Error(`${testCase.role} JWT exchange returned no token`);

      const response = await fetch(`${API_URL}${testCase.path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      results.push({
        role: testCase.role,
        path: testCase.path.split("?")[0],
        status: response.status,
        ...("expectedContentType" in testCase
          ? { contentType: response.headers.get("content-type") ?? "" }
          : {}),
      });
      if (response.status !== testCase.expectedStatus) {
        throw new Error(
          `${testCase.role} request to ${testCase.path} returned HTTP ${response.status}`
        );
      }
      if (
        "expectedContentType" in testCase &&
        !response.headers.get("content-type")?.includes(testCase.expectedContentType)
      ) {
        throw new Error(
          `${testCase.path} did not return ${testCase.expectedContentType}`
        );
      }
      if (testCase.role === "volunteer") volunteerToken = token;
      if (testCase.role === "emergency_coordinator") coordinatorToken = token;
    }

    if (!volunteerToken) throw new Error("Volunteer smoke-test account was not exercised");
    if (!coordinatorToken) throw new Error("Coordinator smoke-test account was not exercised");

    const smokeSkill = `smoke-${randomUUID()}`;
    smokeVolunteerId = new ObjectId();
    smokeTaskTitle = `Smoke task ${randomUUID()}`;
    const now = new Date();
    await db.collection("volunteers").insertOne({
      _id: smokeVolunteerId,
      userId: `smoke-${randomUUID()}`,
      fullName: "Smoke Test Volunteer",
      email: `smoke-${randomUUID()}@example.test`,
      phone: "+10000000000",
      skills: [smokeSkill],
      availability: "available",
      history: [],
      createdAt: now,
      updatedAt: now,
    });
    const autoAssign = await fetch(`${API_URL}/api/tasks/auto-assign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${coordinatorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: smokeTaskTitle,
        description: "Temporary matching smoke test",
        location: "Smoke test location",
        coordinates: { latitude: 0, longitude: 0 },
        requiredSkills: [smokeSkill],
        volunteerCount: 1,
      }),
    });
    const autoAssignPayload = await autoAssign.json() as {
      data?: {
        volunteerIds?: Array<string | ObjectId>;
        volunteerMatching?: { matchedSkills?: string[] };
      };
    };
    if (autoAssign.status !== 201) {
      throw new Error(`Automatic task assignment returned HTTP ${autoAssign.status}`);
    }
    const assignedIds = autoAssignPayload.data?.volunteerIds?.map((id) =>
      typeof id === "string" ? id : id.toHexString()
    ) ?? [];
    if (
      !assignedIds.includes(smokeVolunteerId.toHexString()) ||
      !autoAssignPayload.data?.volunteerMatching?.matchedSkills?.includes(smokeSkill)
    ) {
      throw new Error("Automatic assignment did not select the skill-matched volunteer");
    }
    results.push({
      role: "emergency_coordinator",
      path: "/api/tasks/auto-assign",
      status: autoAssign.status,
    });

    const denied = await fetch(`${API_URL}/api/analytics/overview?days=30`, {
      headers: { Authorization: `Bearer ${volunteerToken}` },
    });
    results.push({
      role: "volunteer",
      path: "/api/analytics/overview",
      status: denied.status,
    });
    if (denied.status !== 403) {
      throw new Error(`Volunteer analytics access returned HTTP ${denied.status}, expected 403`);
    }

    console.log("Demo API smoke tests passed:", JSON.stringify(results));
  } finally {
    try {
      if (smokeTaskTitle) {
        await db.collection("tasks").deleteMany({ title: smokeTaskTitle });
      }
      if (smokeVolunteerId) {
        await db.collection("volunteers").deleteOne({ _id: smokeVolunteerId });
      }
      const sessionUserIds = userIds.flatMap((id) =>
        ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id]
      );
      await db.collection("session").deleteMany({
        userId: { $in: sessionUserIds },
      });
    } finally {
      await client.close();
    }
  }
};

main().catch((error: unknown) => {
  console.error("Demo API smoke test failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
