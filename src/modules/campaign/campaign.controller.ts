import type { Request, Response } from "express";
import { campaignService } from "./campaign.service";
import {
  createCampaignSchema,
  idParamSchema,
  listQuerySchema,
} from "./campaign.validation";

const id = (req: Request) => idParamSchema.parse(req.params).id;

export const campaignController = {
  async create(req: Request, res: Response) {
    const body = createCampaignSchema.parse(req.body);
    const r = await campaignService.create(
      body,
      req.header("Idempotency-Key") ?? undefined,
    );
    res.status(r.duplicate ? 200 : 202).json(r); // 202: accepted, processing continues in the background
  },
  async list(req: Request, res: Response) {
    res.json(await campaignService.list(listQuerySchema.parse(req.query)));
  },
  async get(req: Request, res: Response) {
    res.json(await campaignService.get(id(req)));
  },
  async start(req: Request, res: Response) {
    res.status(202).json(await campaignService.start(id(req)));
  },
  async pause(req: Request, res: Response) {
    res.json({ campaign: await campaignService.pause(id(req)) });
  },
  async resume(req: Request, res: Response) {
    res.json({ campaign: await campaignService.resume(id(req)) });
  },
  async cancel(req: Request, res: Response) {
    res.json({ campaign: await campaignService.cancel(id(req)) });
  },
  async progress(req: Request, res: Response) {
    res.json(await campaignService.progress(id(req)));
  },
};
