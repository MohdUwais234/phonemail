import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AppError } from "../errors.js";
export function signToken(id: string | number) {
  return jwt.sign({}, config.JWT_SECRET, {
    subject: String(id),
    expiresIn: "7d",
    issuer: "phonemail",
    audience: "phonemail-app",
    algorithm: "HS256",
  });
}
export function verifyToken(token: string): string {
  try {
    const p = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "phonemail",
      audience: "phonemail-app",
    });
    if (typeof p === "string" || !p.sub || !/^\d+$/.test(p.sub))
      throw new Error();
    return p.sub;
  } catch {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "Your session has expired. Please sign in again.",
    );
  }
}
