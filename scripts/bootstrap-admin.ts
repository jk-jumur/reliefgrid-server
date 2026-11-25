import "dotenv/config";

import { client, connectDB } from "../src/config/database.js";

const bootstrapFirstAdmin = async (emailArgument: string | undefined) => {
  const email = emailArgument?.trim().toLowerCase();
  if (!email) {
    throw new Error("Provide the email of an existing, active account to promote");
  }

  const db = await connectDB();
  const users = db.collection<{
    _id?: string;
    id?: string;
    email: string;
    role?: string;
    isActive?: boolean;
    organizationId?: string | null;
    updatedAt?: Date;
  }>("user");
  const account = await users.findOne({ email });
  if (!account) throw new Error("No account exists for the supplied email");
  if (account.isActive === false) {
    throw new Error("An inactive account cannot be promoted to system admin");
  }
  if (account.role === "system_admin") {
    console.log("The account already has the system_admin role");
    return;
  }

  const existingAdmins = await users.countDocuments({
    role: "system_admin",
    isActive: { $ne: false },
  });
  if (existingAdmins > 0) {
    throw new Error("An active system admin already exists; use the admin API to change roles");
  }

  const identity = account.id ? { id: account.id } : { _id: account._id };
  const result = await users.updateOne(identity, {
    $set: {
      role: "system_admin",
      organizationId: null,
      updatedAt: new Date(),
    },
  });
  if (!result.matchedCount) {
    throw new Error("The account changed before it could be promoted");
  }
  console.log("The existing account was promoted to system_admin");
};

try {
  await bootstrapFirstAdmin(process.argv[2]);
} finally {
  await client.close();
}
