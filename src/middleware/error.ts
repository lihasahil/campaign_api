import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export function notFoundHandler(_req: Request, res: Response) {
  res
    .status(404)
    .json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({
        error: {
          code: 'VALIDATION',
          message: 'Invalid request',
          details: err.issues,
        },
      });
  if (err instanceof AppError)
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message } });
  logger.error({ err, path: req.path }, 'unhandled error');
  res
    .status(500)
    .json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () =>
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start,
      },
      'request'
    )
  );
  next();
}
