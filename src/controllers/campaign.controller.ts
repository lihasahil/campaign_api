import type { Request, Response } from "express";
import { campaignService } from "../services/campaign.service";
import { messageService } from "../services/message.service";
import { orgOf } from "../middleware/auth";
import { createCampaignSchema, idParamSchema, listCampaignsQuerySchema, listMessagesQuerySchema } from "../validators/campaign.validator";

// Controllers only parse/validate the request and shape the response. Rules live in the service.
// Express 5 forwards rejected promises to the error middleware, so no try/catch is needed.
const id = (req: Request) => idParamSchema.parse(req.params).id;

export const campaignController = {
  async create(req: Request, res: Response) {
    const r = await campaignService.create(orgOf(req), createCampaignSchema.parse(req.body), req.header("Idempotency-Key") ?? undefined);
    res.status(r.duplicate ? 200 : 202).json(r); // 202: accepted, processing continues in the background
  },
  async list(req: Request, res: Response) {
    res.json(await campaignService.list(orgOf(req), listCampaignsQuerySchema.parse(req.query)));
  },
  async get(req: Request, res: Response) {
    res.json(await campaignService.get(orgOf(req), id(req)));
  },
  async start(req: Request, res: Response) {
    res.status(202).json(await campaignService.start(orgOf(req), id(req)));
  },
  async pause(req: Request, res: Response) {
    res.json({ campaign: await campaignService.pause(orgOf(req), id(req)) });
  },
  async resume(req: Request, res: Response) {
    res.json({ campaign: await campaignService.resume(orgOf(req), id(req)) });
  },
  async cancel(req: Request, res: Response) {
    res.json({ campaign: await campaignService.cancel(orgOf(req), id(req)) });
  },
  async progress(req: Request, res: Response) {
    res.json(await campaignService.progress(orgOf(req), id(req)));
  },
  async messages(req: Request, res: Response) {
    const q = listMessagesQuerySchema.parse(req.query);
    await campaignService.assertOwned(id(req), orgOf(req));
    res.json(await messageService.listForCampaign(id(req), q.status, q.page, q.limit));
  },
};
