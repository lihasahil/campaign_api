import { Router } from 'express';
import { authController as c } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

export const authRoutes = Router();
authRoutes.post('/register', c.register);
authRoutes.post('/login', c.login);
authRoutes.post('/refresh', c.refresh);
authRoutes.post('/logout', c.logout);
authRoutes.get('/me', requireAuth, c.me);
