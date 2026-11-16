import type { Request, Response } from "express";
import { authService } from "../services/auth.service";
import { loginSchema, registerSchema } from "../validators/auth.validator";
import { orgOf } from "../middleware/auth";

export const authController = {
  async register(req: Request, res: Response) {
    res.status(201).json(await authService.register(registerSchema.parse(req.body)));
  },
  async login(req: Request, res: Response) {
    res.json(await authService.login(loginSchema.parse(req.body)));
  },
  async me(req: Request, res: Response) {
    res.json({ organization: await authService.me(orgOf(req)) });
  },
};
