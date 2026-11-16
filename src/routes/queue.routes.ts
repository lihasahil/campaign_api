import { Router } from "express";
import { queueController } from "../controllers/queue.controller";

export const queueRoutes = Router();
queueRoutes.get("/stats", queueController.stats);
