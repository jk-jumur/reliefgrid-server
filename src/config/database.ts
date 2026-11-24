
import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

const client = new MongoClient(MONGODB_URI);

let database: Db | null = null;

export const connectDB = async (): Promise<Db> => {
  if (database) {
    return database;
  }

  try {
    await client.connect();

    database = client.db("reliefgrid");

    console.log("MongoDB connected successfully!");

    return database;
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    throw error;
  }
};
