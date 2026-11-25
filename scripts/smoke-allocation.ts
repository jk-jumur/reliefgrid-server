import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ObjectId } from "mongodb";

interface DemoCredential {
  id: string;
  email: string;
  password: string;
  role: string;
  organizationId: string | null;
}

interface DemoCredentials {
  accounts: DemoCredential[];
}

const DEMO_DATABASE = "reliefgrid";
const API_URL = (process.env.DEMO_API_URL || "http://localhost:5000").replace(/\/+$/, "");
const CLIENT_ORIGIN = process.env.CLIENT_URL || "http://localhost:3000";

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Allocation smoke tests cannot be run when NODE_ENV=production");
  }
  if (process.env.MONGODB_DATABASE && process.env.MONGODB_DATABASE !== DEMO_DATABASE) {
    throw new Error(`Set MONGODB_DATABASE=${DEMO_DATABASE} before running allocation tests`);
  }
  process.env.MONGODB_DATABASE = DEMO_DATABASE;

  const credentials = JSON.parse(
    await readFile(`${process.cwd()}/.demo-credentials.json`, "utf8")
  ) as DemoCredentials;
  const organization = credentials.accounts.find(({ role }) => role === "relief_organization");
  const coordinator = credentials.accounts.find(({ role }) => role === "emergency_coordinator");
  if (!organization?.organizationId || !coordinator) {
    throw new Error("Demo organization and coordinator accounts are required");
  }
  const { client, db } = await import("../src/config/database.js");
  const sessionsToClean = [organization.id, coordinator.id];
  const createdResourceIds: ObjectId[] = [];
  const createdRequestIds: ObjectId[] = [];

  const getBearerToken = async (account: DemoCredential): Promise<string> => {
    const login = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: CLIENT_ORIGIN },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        rememberMe: false,
      }),
    });
    if (!login.ok) throw new Error(`${account.role} login failed with HTTP ${login.status}`);
    const cookies = login.headers.getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    const tokenResponse = await fetch(`${API_URL}/api/auth/token`, {
      headers: { Cookie: cookies, Origin: CLIENT_ORIGIN },
    });
    if (!tokenResponse.ok) {
      throw new Error(`${account.role} JWT exchange failed with HTTP ${tokenResponse.status}`);
    }
    const { token } = await tokenResponse.json() as { token?: string };
    if (!token) throw new Error(`${account.role} JWT exchange returned no token`);
    return token;
  };

  const organizationToken = await getBearerToken(organization);
  const coordinatorToken = await getBearerToken(coordinator);
  const call = async (
    token: string,
    path: string,
    method: string,
    body?: Record<string, unknown>
  ) => {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json() as {
      success?: boolean;
      data?: Record<string, unknown>;
      message?: string;
    };
    return { response, payload };
  };

  try {
    const requestMarker = randomUUID();
    const resourceResult = await call(
      organizationToken,
      "/api/resources",
      "POST",
      {
        name: `Transaction test resource ${requestMarker}`,
        category: "drinking_water",
        availableQuantity: 73,
        storageLocation: `Temporary test storage ${requestMarker}`,
      }
    );
    assert.equal(resourceResult.response.status, 201);
    const resourceId = new ObjectId(String(resourceResult.payload.data?._id));
    createdResourceIds.push(resourceId);

    const emergencyRequestResult = await call(
      organizationToken,
      "/api/emergency-requests",
      "POST",
      {
        requestType: "drinking_water",
        requiredQuantity: 40,
        location: `Temporary transaction test ${requestMarker}`,
        coordinates: { latitude: 24.9, longitude: 91.9 },
        affectedPeople: 20,
        description: `Temporary transaction integrity test ${requestMarker}`,
        urgency: "high",
        locationRisk: "medium",
      }
    );
    assert.equal(emergencyRequestResult.response.status, 201);
    const emergencyRequestId = new ObjectId(String(emergencyRequestResult.payload.data?._id));
    createdRequestIds.push(emergencyRequestId);

    const requestPath = `/api/emergency-requests/${emergencyRequestId.toHexString()}`;
    for (const status of ["under_review", "verified"]) {
      const result = await call(coordinatorToken, requestPath, "PATCH", { status });
      assert.equal(result.response.status, 200);
    }

    const allocationResult = await call(
      organizationToken,
      "/api/resource-allocations",
      "POST",
      {
        emergencyRequestId: emergencyRequestId.toHexString(),
        resourceId: resourceId.toHexString(),
        organizationId: organization.organizationId,
        allocationQuantity: 25,
      }
    );
    assert.equal(allocationResult.response.status, 201);
    const allocationId = String(allocationResult.payload.data?._id);
    const resourcePath = `/api/resources/${resourceId.toHexString()}`;
    const reservedResource = await call(organizationToken, resourcePath, "GET");
    assert.equal(reservedResource.response.status, 200);
    assert.equal(reservedResource.payload.data?.availableQuantity, 48);
    assert.equal(reservedResource.payload.data?.allocatedQuantity, 25);

    const failedAllocation = await call(
      organizationToken,
      "/api/resource-allocations",
      "POST",
      {
        emergencyRequestId: emergencyRequestId.toHexString(),
        resourceId: resourceId.toHexString(),
        organizationId: organization.organizationId,
        allocationQuantity: 16,
      }
    );
    assert.equal(failedAllocation.response.status, 409);
    const unchangedResource = await call(organizationToken, resourcePath, "GET");
    assert.equal(unchangedResource.payload.data?.availableQuantity, 48);
    assert.equal(unchangedResource.payload.data?.allocatedQuantity, 25);

    const deniedApproval = await call(
      organizationToken,
      `/api/resource-allocations/${allocationId}`,
      "PATCH",
      { status: "approved" }
    );
    assert.equal(deniedApproval.response.status, 403);

    await call(coordinatorToken, `/api/resource-allocations/${allocationId}`, "PATCH", {
      status: "approved",
    }).then(({ response }) => assert.equal(response.status, 200));
    for (const status of ["preparing", "dispatched", "in_transit"]) {
      const result = await call(
        organizationToken,
        `/api/resource-allocations/${allocationId}`,
        "PATCH",
        { status }
      );
      assert.equal(result.response.status, 200);
    }

    const qrResult = await call(
      organizationToken,
      `/api/resource-allocations/${allocationId}/verification-qr`,
      "POST"
    );
    assert.equal(qrResult.response.status, 201);
    const qrData = qrResult.payload.data;
    assert.equal(
      String(qrData?.qrCodeDataUrl).startsWith("data:image/png;base64,"),
      true
    );
    const verificationToken = String(qrData?.verificationToken ?? "");
    assert.match(verificationToken, /^[A-Za-z0-9_-]{43}$/);
    const deliveryVerification = await call(
      coordinatorToken,
      "/api/resource-allocations/verify-delivery",
      "POST",
      { token: verificationToken }
    );
    assert.equal(deliveryVerification.response.status, 200);
    assert.equal(deliveryVerification.payload.data?.verifiedBy, coordinator.id);
    const replay = await call(
      coordinatorToken,
      "/api/resource-allocations/verify-delivery",
      "POST",
      { token: verificationToken }
    );
    assert.equal(replay.response.status, 410);

    const completed = await call(
      organizationToken,
      `/api/resource-allocations/${allocationId}`,
      "PATCH",
      { status: "completed" }
    );
    assert.equal(completed.response.status, 200);

    const deliveredResource = await call(organizationToken, resourcePath, "GET");
    assert.equal(deliveredResource.payload.data?.availableQuantity, 48);
    assert.equal(deliveredResource.payload.data?.allocatedQuantity, 0);
    assert.equal(deliveredResource.payload.data?.distributedQuantity, 25);
    const updatedRequest = await call(organizationToken, requestPath, "GET");
    assert.equal(updatedRequest.payload.data?.deliveredQuantity, 25);
    assert.equal(updatedRequest.payload.data?.status, "in_progress");
    console.log("Allocation transaction smoke test passed: reserve, reject-overdraw, role guard, and delivery.");
  } finally {
    const resourceIds = createdResourceIds;
    const requestIds = createdRequestIds;
    await Promise.all([
      ...(requestIds.length
        ? [db.collection("resourceAllocations").deleteMany({
            emergencyRequestId: { $in: requestIds },
          })]
        : []),
      ...(resourceIds.length
        ? [db.collection("resourceAllocations").deleteMany({
            resourceId: { $in: resourceIds },
          })]
        : []),
      ...(resourceIds.length
        ? [db.collection("resources").deleteMany({ _id: { $in: resourceIds } })]
        : []),
      ...(requestIds.length
        ? [db.collection("emergencyRequests").deleteMany({ _id: { $in: requestIds } })]
        : []),
      db.collection("session").deleteMany({
        userId: {
          $in: sessionsToClean.flatMap((id) =>
            ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id]
          ),
        },
      }),
    ]);
    await client.close();
  }
};

main().catch((error: unknown) => {
  console.error("Allocation smoke test failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
