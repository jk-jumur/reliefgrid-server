
import { Router } from "express";
import protectedRouter from "./protected.route.js";

const router = Router();

router.use(protectedRouter);

// API module routes will be registered here.

export default router;
