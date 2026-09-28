import type { RequestHandler } from "express";
import { verifyToken } from "../auth/jwt.js";
import { AppError } from "../errors.js";
export const requireAuth: RequestHandler = (req, _res, next) => {
  const match = req.headers.authorization?.match(/^Bearer (\S+)$/);
  if (!match) throw new AppError(401, "UNAUTHORIZED", "Sign in to continue.");
  req.userId = verifyToken(match[1]);
  next();
};
