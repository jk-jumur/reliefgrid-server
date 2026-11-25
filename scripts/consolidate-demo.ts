import "dotenv/config";

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient, ObjectId, type Document } from "mongodb";

const SOURCE_DATABASE = "reliefgrid_demo";
const TARGET_DATABASE = "reliefgrid";
const MARKER_ID = "reliefgrid-demo-v1";

interface DemoCredential {
  id: string;
  email: string;
}

interface CredentialsFile {
  database: string;
  accounts: DemoCredential[];
}

interface DemoDocument extends Document {
  _id: ObjectId | string;
}

const collectionsToCopy = [
  "account",
  "organizations",
  "incidents",
  "emergencyRequests",
  "shelters",
  "volunteers",
  "resources",
  "resourceAllocations",
  "teams",
  "tasks",
  "notificationReceipts",
  "demoSeedMetadata",
] as const;

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo consolidation must not run when NODE_ENV=production");
  }
  if (!process.argv.includes("--confirm-consolidation")) {
    throw new Error("Pass --confirm-consolidation to merge reliefgrid_demo into reliefgrid");
  }

  const credentialsPath = `${process.cwd()}/.demo-credentials.json`;
  const credentials = JSON.parse(
    await readFile(credentialsPath, "utf8")
  ) as CredentialsFile;
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const source = client.db(SOURCE_DATABASE);
  const target = client.db(TARGET_DATABASE);

  try {
    const marker = await source.collection<DemoDocument>("demoSeedMetadata").findOne({
      _id: MARKER_ID,
      status: "completed",
    });
    if (!marker) throw new Error("Completed demo seed metadata was not found");
    if (credentials.database !== SOURCE_DATABASE) {
      throw new Error("Credentials file does not identify the expected source database");
    }

    const demoUserIds = credentials.accounts.map(({ id }) => id);
    const credentialByEmail = new Map(
      credentials.accounts.map(({ email, id }) => [email, id])
    );
    const sourceUsers = await source.collection<DemoDocument>("user")
      .find({ email: { $in: credentials.accounts.map(({ email }) => email) } })
      .toArray();
    assert.equal(sourceUsers.length, demoUserIds.length, "Expected every demo account in source");
    for (const user of sourceUsers) {
      assert.equal(
        String(user._id),
        credentialByEmail.get(String(user.email)),
        "Demo credential ID must match its MongoDB user ID"
      );
    }
    const mongoUserIds = sourceUsers.map(({ _id }) => _id);
    const targetEmailConflicts = await target.collection<DemoDocument>("user").countDocuments({
      email: { $in: sourceUsers.map((user) => user.email) },
    });
    if (targetEmailConflicts > 0) {
      throw new Error("A demo account email already exists in reliefgrid; no records were copied");
    }

    const sourceDocuments = new Map<string, DemoDocument[]>();
    sourceDocuments.set("user", sourceUsers);
    sourceDocuments.set(
      "account",
      await source.collection<DemoDocument>("account")
        .find({ userId: { $in: mongoUserIds } }).toArray()
    );
    sourceDocuments.set(
      "organizations",
      await source.collection<DemoDocument>("organizations")
        .find({ dataOrigin: "generated_demo" }).toArray()
    );
    for (const name of collectionsToCopy.filter((collection) =>
      !["account", "organizations", "demoSeedMetadata"].includes(collection)
    )) {
      sourceDocuments.set(
        name,
        await source.collection<DemoDocument>(name)
          .find({ dataOrigin: "generated_demo" }).toArray()
      );
    }
    sourceDocuments.set(
      "demoSeedMetadata",
      await source.collection<DemoDocument>("demoSeedMetadata")
        .find({ _id: MARKER_ID }).toArray()
    );

    const operationalCollections = [
      "organizations",
      "incidents",
      "emergencyRequests",
      "shelters",
      "volunteers",
      "resources",
      "resourceAllocations",
      "teams",
      "tasks",
    ];
    const existingOperationalCounts = await Promise.all(
      operationalCollections.map((name) =>
        target.collection<DemoDocument>(name).countDocuments()
      )
    );
    if (existingOperationalCounts.some((count) => count > 0)) {
      throw new Error("reliefgrid already contains operational records; refusing to merge");
    }

    for (const [name, documents] of sourceDocuments) {
      if (documents.length === 0) continue;
      const conflictingIds = await target.collection<DemoDocument>(name).countDocuments({
        _id: { $in: documents.map(({ _id }) => _id) },
      });
      if (conflictingIds > 0) {
        throw new Error(`Collection "${name}" contains conflicting document IDs`);
      }
      if (name === "account") {
        const conflictingAccounts = await Promise.all(
          documents.map(({ providerId, accountId }) =>
            target.collection<DemoDocument>(name).countDocuments({ providerId, accountId })
          )
        );
        if (conflictingAccounts.some((count) => count > 0)) {
          throw new Error("An auth provider account already exists in reliefgrid");
        }
      }
    }

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const [name, documents] of sourceDocuments) {
          if (documents.length > 0) {
            await target.collection<DemoDocument>(name).insertMany(documents, { session });
          }
        }
      });
    } finally {
      await session.endSession();
    }

    for (const [name, documents] of sourceDocuments) {
      const copiedCount = await target.collection<DemoDocument>(name).countDocuments({
        ...(        name === "user" ? { email: { $in: sourceUsers.map((user) => user.email) } } :
        name === "account" ? { userId: { $in: mongoUserIds } } :
            name === "demoSeedMetadata" ? { _id: MARKER_ID } :
              { dataOrigin: "generated_demo" }),
      });
      assert.equal(copiedCount, documents.length, `Count mismatch for "${name}"`);
    }

    const targetVolunteers = await target.collection<DemoDocument>("volunteers").countDocuments({
      dataOrigin: "generated_demo",
      userId: { $in: demoUserIds },
    });
    assert.equal(targetVolunteers, 100, "Volunteer profiles must retain their account links");

    await writeFile(
      credentialsPath,
      `${JSON.stringify({ ...credentials, database: TARGET_DATABASE }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
    console.log("Copied generated demo records and role accounts into reliefgrid.");
    console.log("Existing reliefgrid signing keys and all auth sessions were preserved.");
    console.log("The source reliefgrid_demo database has NOT been deleted yet.");
    console.log(JSON.stringify(Object.fromEntries(
      Array.from(sourceDocuments, ([name, documents]) => [name, documents.length])
    )));
  } finally {
    await client.close();
  }
};

main().catch((error: unknown) => {
  console.error("Demo consolidation failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
