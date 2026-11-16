import type { Request, Response } from "express";
import { queueService } from "../services/queue.service";

export const queueController = {
  async stats(_req: Request, res: Response) {
    res.json(await queueService.stats());
  },
};
