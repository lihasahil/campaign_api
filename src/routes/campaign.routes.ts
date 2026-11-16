import { Router } from "express";
import { campaignController as c } from "../controllers/campaign.controller";

export const campaignRoutes = Router();
campaignRoutes.post("/", c.create);
campaignRoutes.get("/", c.list);
campaignRoutes.get("/:id", c.get);
campaignRoutes.post("/:id/start", c.start);
campaignRoutes.post("/:id/pause", c.pause);
campaignRoutes.post("/:id/resume", c.resume);
campaignRoutes.post("/:id/cancel", c.cancel);
campaignRoutes.get("/:id/progress", c.progress);
campaignRoutes.get("/:id/messages", c.messages);
