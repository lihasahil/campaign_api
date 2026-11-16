import type { Request, Response } from 'express';
import {
  authCookieOptions,
  authService,
  createTokens,
  setAuthCookies,
  verifyToken,
} from '../services/auth.service';
import { AppError } from '../../utils/errors';
import { loginSchema, registerSchema } from '../validators/auth.validator';

export const authController = {
  async register(req: Request, res: Response) {
    const session = await authService.register(registerSchema.parse(req.body));
    setAuthCookies(res, session);
    const { accessToken, refreshToken, ...response } = session;
    res.status(201).json(response);
  },
  async login(req: Request, res: Response) {
    const session = await authService.login(loginSchema.parse(req.body));
    setAuthCookies(res, session);
    const { accessToken, refreshToken, ...response } = session;
    res.json(response);
  },
  async refresh(req: Request, res: Response) {
    const refreshToken = Object.fromEntries(
      (req.header('cookie') ?? '')
        .split(';')
        .map(part => part.trim().split('='))
        .filter(([name, value]) => name && value)
    ).refreshToken;
    if (!refreshToken)
      throw new AppError(401, 'Missing refresh token cookie', 'UNAUTHORIZED');
    const { sub, orgId } = verifyToken(refreshToken, 'refresh');
    await authService.me(orgId);
    const tokens = createTokens({ id: sub, orgId });
    setAuthCookies(res, tokens);
    res.json({ accessTokenExpiresIn: authCookieOptions.access.maxAge });
  },
  async logout(_req: Request, res: Response) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    res.status(204).send();
  },
  async me(req: Request, res: Response) {
    res.json({ organization: await authService.me(req.organizationId) });
  },
};
