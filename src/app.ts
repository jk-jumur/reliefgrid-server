
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./config/auth.js";
import apiRouter from "./routes/index.js";

import { errorHandler } from "./middleware/error.middleware.js";
import { notFoundHandler } from "./middleware/not-found.middleware.js";

const app = express();

// CORS Configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Better Auth Routes (must be before body parsers)
app.all("/api/auth/*splat", toNodeHandler(auth));

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "ReliefGrid API is running successfully!",
  });
});

// API Routes
app.use("/api", apiRouter);

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

export default app;
