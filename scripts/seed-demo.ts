import "dotenv/config";

import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { access, unlink, writeFile } from "node:fs/promises";
import { faker } from "@faker-js/faker";
import { ObjectId } from "mongodb";
import type { UserRole } from "../src/constants/roles.js";
import type { OrganizationDocument } from "../src/modules/organizations/organization.model.js";
import {
  DEMO_DATA_COUNTS,
  generateDemoDataset,
  type DemoIdentity,
} from "./demo-seed-data.js";

const DEMO_DATABASE = "reliefgrid";
const SEED_MARKER_ID = "reliefgrid-demo-v1";
const OPERATIONAL_COLLECTIONS = [
  "organizations",
  "incidents",
  "emergencyRequests",
  "shelters",
  "volunteers",
  "resources",
  "resourceAllocations",
  "teams",
  "tasks",
] as const;
const CREDENTIALS_PATH = `${process.cwd()}/.demo-credentials.json`;

interface DemoAccountSpec {
  role: UserRole;
  organizationId: string | null;
  name: string;
  email: string;
  password: string;
}

interface CreatedDemoAccount extends DemoIdentity {
  role: UserRole;
  organizationId: string | null;
}

const parseSeed = (): number => {
  const seedArgument = process.argv.find((argument) => argument.startsWith("--seed="));
  if (!seedArgument) return randomInt(1, 2_147_483_647);
  const seed = Number(seedArgument.slice("--seed=".length));
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 2_147_483_646) {
    throw new Error("--seed must be an integer between 1 and 2147483646");
  }
  return seed;
};

const authUserIdVariants = (ids: string[]): Array<string | ObjectId> =>
  ids.flatMap((id) => ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id]);

const ensureCredentialsFileDoesNotExist = async (): Promise<void> => {
  try {
    await access(CREDENTIALS_PATH);
    throw new Error(
      `${CREDENTIALS_PATH} already exists; move it securely before generating new demo credentials`
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
};

const makeAccountSpec = (
  role: UserRole,
  organizationId: string | null = null
): DemoAccountSpec => ({
  role,
  organizationId,
  name: faker.person.fullName(),
  email: `demo-${role}-${randomUUID()}@example.com`,
  password: randomBytes(24).toString("base64url"),
});

const cleanupFailedSeed = async (
  db: import("mongodb").Db,
  accountIds: string[],
  emails: string[],
  credentialsWritten: boolean
): Promise<void> => {
  const cleanupOperations = [
    db.collection("user").deleteMany({ email: { $in: emails } }),
    db.collection("account").deleteMany({ userId: { $in: accountIds } }),
    db.collection("session").deleteMany({
      userId: { $in: authUserIdVariants(accountIds) },
    }),
    db.collection("verification").deleteMany({ identifier: { $in: emails } }),
    ...OPERATIONAL_COLLECTIONS.map((name) =>
      db.collection(name).deleteMany({ dataOrigin: "generated_demo" })
    ),
    db.collection<{ _id: string }>("demoSeedMetadata").deleteOne({ _id: SEED_MARKER_ID }),
  ];
  const results = await Promise.allSettled(cleanupOperations);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Demo seed cleanup failed:", result.reason);
    }
  }
  if (credentialsWritten) {
    try {
      await unlink(CREDENTIALS_PATH);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        console.error("Could not remove the partial demo credentials file:", error);
      }
    }
  }
};

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo data cannot be seeded when NODE_ENV=production");
  }
  if (!process.argv.includes("--confirm-demo-data")) {
    throw new Error(
      "Demo seeding is opt-in. Re-run with --confirm-demo-data to add demo records to reliefgrid"
    );
  }

  await ensureCredentialsFileDoesNotExist();
  const seed = parseSeed();
  const generatedAt = new Date();
  const organizationIds = Array.from(
    { length: DEMO_DATA_COUNTS.organizations },
    () => `demo-${randomUUID()}`
  );
  const accountSpecs: DemoAccountSpec[] = [
    makeAccountSpec("system_admin"),
    makeAccountSpec("emergency_coordinator"),
    makeAccountSpec("citizen"),
    makeAccountSpec("shelter_manager"),
    ...organizationIds.map((organizationId) =>
      makeAccountSpec("relief_organization", organizationId)
    ),
    ...Array.from(
      { length: DEMO_DATA_COUNTS.volunteers },
      () => makeAccountSpec("volunteer")
    ),
  ];

  process.env.MONGODB_DATABASE = DEMO_DATABASE;
  const [{ client, connectDB }, { auth }] = await Promise.all([
    import("../src/config/database.js"),
    import("../src/config/auth.js"),
  ]);
  const db = await connectDB();
  if (db.databaseName !== DEMO_DATABASE) {
    await client.close();
    throw new Error(`Refusing to seed unexpected database "${db.databaseName}"`);
  }

  let credentialsWritten = false;
  const createdAccounts: CreatedDemoAccount[] = [];
  const createdAccountIds: string[] = [];
  const accountEmails = accountSpecs.map(({ email }) => email);
  const seedMetadata = db.collection<{
    _id: string;
    status: string;
    seed: number;
    generatedAt: Date;
    dataOrigin: "generated_demo";
  }>("demoSeedMetadata");

  try {
    const markerExists = await seedMetadata.findOne({
      _id: SEED_MARKER_ID,
    });
    if (markerExists) {
      throw new Error("A demo dataset already exists; refusing to overwrite it");
    }

    const existingDemoAccounts = await db.collection("user").countDocuments({
      email: { $in: accountEmails },
    });
    const existingOperationalCounts = await Promise.all(
      OPERATIONAL_COLLECTIONS.map((name) => db.collection(name).countDocuments())
    );
    if (
      existingDemoAccounts > 0 ||
      existingOperationalCounts.some((count) => count > 0)
    ) {
      throw new Error(
        "The target database already contains matching demo accounts or operational records"
      );
    }

    await seedMetadata.insertOne({
      _id: SEED_MARKER_ID,
      status: "in_progress",
      seed,
      generatedAt,
      dataOrigin: "generated_demo",
    });

    for (const spec of accountSpecs) {
      const result = await auth.api.signUpEmail({
        body: {
          name: spec.name,
          email: spec.email,
          password: spec.password,
        },
      });
      const identity = result.user.id;
      createdAccountIds.push(identity);
      const possibleIds: Array<Record<string, string | ObjectId>> = [
        { id: identity },
        { _id: identity },
      ];
      if (ObjectId.isValid(identity)) {
        possibleIds.push({ _id: new ObjectId(identity) });
      }
      const accountUpdate = await db.collection("user").updateOne(
        { $or: possibleIds },
        {
          $set: {
            role: spec.role,
            organizationId: spec.organizationId,
            isActive: true,
            updatedAt: new Date(),
          },
        }
      );
      if (accountUpdate.matchedCount !== 1) {
        throw new Error(`Could not assign the demo role to ${spec.email}`);
      }
      createdAccounts.push({
        id: identity,
        name: spec.name,
        email: spec.email,
        role: spec.role,
        organizationId: spec.organizationId,
      });
    }
    await db.collection("session").deleteMany({
      userId: { $in: authUserIdVariants(createdAccountIds) },
    });

    const byRole = (role: UserRole) =>
      createdAccounts.filter((account) => account.role === role);
    const organizationUsers = byRole("relief_organization");
    const volunteerUsers = byRole("volunteer");
    const systemAdmin = byRole("system_admin")[0];
    const coordinator = byRole("emergency_coordinator")[0];
    const citizen = byRole("citizen")[0];
    const shelterManager = byRole("shelter_manager")[0];

    const generated = generateDemoDataset({
      seed,
      generatedAt,
      systemAdmin,
      coordinator,
      citizen,
      shelterManager,
      organizationIds,
      organizationUsers,
      volunteerUsers,
    });

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection<OrganizationDocument>("organizations").insertMany(
          generated.organizations,
          { session }
        );
        await db.collection("incidents").insertMany(generated.incidents, { session });
        await db.collection("emergencyRequests").insertMany(generated.emergencyRequests, { session });
        await db.collection("shelters").insertMany(generated.shelters, { session });
        await db.collection("volunteers").insertMany(generated.volunteers, { session });
        await db.collection("resources").insertMany(generated.resources, { session });
        await seedMetadata.updateOne(
          { _id: SEED_MARKER_ID },
          {
            $set: {
              status: "completed",
              completedAt: new Date(),
              counts: DEMO_DATA_COUNTS,
            },
          },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    const credentials = {
      database: DEMO_DATABASE,
      generatedAt: generatedAt.toISOString(),
      seed,
      accounts: createdAccounts.map(({ id, name, email, role, organizationId }) => ({
        id,
        name,
        email,
        role,
        organizationId,
        password: accountSpecs.find((account) => account.email === email)?.password,
      })),
    };
    await writeFile(CREDENTIALS_PATH, `${JSON.stringify(credentials, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    credentialsWritten = true;
    console.log(`Seeded "${DEMO_DATABASE}" with demo data using seed ${seed}.`);
    console.log("Generated counts:", DEMO_DATA_COUNTS);
    console.log("Demo login credentials were written to .demo-credentials.json (mode 0600).");
    console.log("The API can use this dataset with MONGODB_DATABASE=reliefgrid.");
  } catch (error) {
    await cleanupFailedSeed(db, createdAccountIds, accountEmails, credentialsWritten);
    throw error;
  } finally {
    await client.close();
  }
};

main().catch((error: unknown) => {
  console.error("Demo seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
