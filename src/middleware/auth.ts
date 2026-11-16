import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../services/auth.service";
import { AppError } from "../../utils/errors";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const cookies = Object.fromEntries(
    (req.header("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, ...value]) => [name, value.join("=")]),
  );
  const token = cookies.accessToken;
  if (!token)
    return next(
      new AppError(401, "Missing access token cookie", "UNAUTHORIZED"),
    );
  try {
    req.auth = verifyToken(token);
    next();
  } catch (e) {
    const expired = (e as Error).name === "TokenExpiredError";
    next(
      new AppError(
        401,
        expired ? "Token expired" : "Invalid token",
        "UNAUTHORIZED",
      ),
    );
  }
}
export const orgOf = (req: Request) => req.auth!.orgId;
