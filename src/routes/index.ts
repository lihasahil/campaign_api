import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { campaignRoutes } from "./campaign.routes";
import { messageRoutes } from "./message.routes";
import { notificationRoutes } from "./notification.routes";
import { queueRoutes } from "./queue.routes";
import { requireAuth } from "../middleware/auth";

export const apiRouter = Router();
apiRouter.use("/auth", authRoutes); // only public routes live here (register/login)
// Everything below needs a valid JWT; the orgId from the token scopes all data access.
apiRouter.use("/campaigns", requireAuth, campaignRoutes);
apiRouter.use("/messages", requireAuth, messageRoutes);
apiRouter.use("/notifications", requireAuth, notificationRoutes);
apiRouter.use("/queues", requireAuth, queueRoutes);
