
import { Router } from "express";
import protectedRouter from "./protected.route.js";
import incidentRouter from "../modules/incidents/incident.route.js";
import emergencyRequestRouter from "../modules/emergency-requests/emergency-request.route.js";
import resourceRouter from "../modules/resources/resource.route.js";
import resourceAllocationRouter from "../modules/resource-allocations/resource-allocation.route.js";
import shelterRouter from "../modules/shelters/shelter.route.js";
import volunteerRouter from "../modules/volunteers/volunteer.route.js";
import teamRouter from "../modules/teams/team.route.js";
import taskRouter from "../modules/tasks/task.route.js";
import analyticsRouter from "../modules/analytics/analytics.route.js";
import exportRouter from "../modules/exports/export.route.js";
import organizationRouter from "../modules/organizations/organization.route.js";
import adminRouter from "../modules/admin/admin.route.js";
import activityLogRouter from "../modules/activity-logs/activity-log.route.js";
import notificationRouter from "../modules/notifications/notification.route.js";
import uploadRouter from "../modules/uploads/upload.route.js";
import mapRouter from "../modules/map/map.route.js";

const router = Router();

router.use(protectedRouter);
router.use("/incidents", incidentRouter);
router.use("/emergency-requests", emergencyRequestRouter);
router.use("/resources", resourceRouter);
router.use("/resource-allocations", resourceAllocationRouter);
router.use("/shelters", shelterRouter);
router.use("/volunteers", volunteerRouter);
router.use("/teams", teamRouter);
router.use("/tasks", taskRouter);
router.use("/analytics", analyticsRouter);
router.use("/exports", exportRouter);
router.use("/organizations", organizationRouter);
router.use("/admin", adminRouter);
router.use("/activity-logs", activityLogRouter);
router.use("/notifications", notificationRouter);
router.use("/uploads", uploadRouter);
router.use("/map", mapRouter);

export default router;
