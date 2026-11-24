
import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

export const client = new MongoClient(MONGODB_URI);

export const db: Db = client.db("reliefgrid");

let connectionPromise: Promise<MongoClient> | null = null;

export const connectDB = async (): Promise<Db> => {
  try {
    if (!connectionPromise) {
      connectionPromise = client.connect();
    }

    await connectionPromise;

    return db;
  } catch (error) {
    connectionPromise = null;

    console.error("MongoDB connection failed:", error);

    throw error;
  }
};
