
import express from "express";
import cors from "cors";

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

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check API
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "ReliefGrid API is running successfully!",
  });
});

// 404 Not Found Middleware
app.use(notFoundHandler);

// Centralized Error Handler
app.use(errorHandler);

export default app;
