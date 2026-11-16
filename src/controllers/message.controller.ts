import type { Request, Response } from "express";
import { messageService } from "../services/message.service";
import { orgOf } from "../middleware/auth";
import { idParamSchema } from "../validators/campaign.validator";

export const messageController = {
  async get(req: Request, res: Response) {
    res.json(await messageService.get(orgOf(req), idParamSchema.parse(req.params).id));
  },
};
