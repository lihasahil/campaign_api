import { Router } from "express";
import { z } from "zod";
import { campaignController as c } from "./campaign.controller";
import { messageService } from "../message/message.service";

export const campaignRoutes = Router();
campaignRoutes.post("/", c.create);
campaignRoutes.get("/", c.list);
campaignRoutes.get("/:id", c.get);
campaignRoutes.post("/:id/start", c.start);
campaignRoutes.post("/:id/pause", c.pause);
campaignRoutes.post("/:id/resume", c.resume);
campaignRoutes.post("/:id/cancel", c.cancel);
campaignRoutes.get("/:id/progress", c.progress);
campaignRoutes.get("/:id/messages", async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const q = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      status: z.enum(["PENDING", "PROCESSING", "SENT", "FAILED"]).optional(),
    })
    .parse(req.query);
  res.json(await messageService.listForCampaign(id, q.status, q.page, q.limit));
});
