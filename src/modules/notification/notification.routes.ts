import { Router } from "express";
import { z } from "zod";
import { notificationService } from "./notification.service";

export const notificationRoutes = Router();
notificationRoutes.get("/", async (req, res) => {
  const q = z.object({ organizationId: z.string().optional(), campaignId: z.string().uuid().optional() }).parse(req.query);
  res.json({ data: await notificationService.list(q.organizationId, q.campaignId) });
});
