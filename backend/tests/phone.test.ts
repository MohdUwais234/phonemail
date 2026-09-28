import { describe, it, expect } from "vitest";
import { normalizePhone, phoneEmail } from "../src/phone/normalize.js";
import { signToken, verifyToken } from "../src/auth/jwt.js";
import jwt from "jsonwebtoken";
import { config } from "../src/config.js";
describe("phone identity", () => {
  it.each(["9876543210", "919876543210", "+919876543210", "+91 98765 43210"])(
    "normalizes %s",
    (input) => expect(normalizePhone(input)).toBe("+919876543210"),
  );
  it.each(["", "12345", "+449876543210", "abc9876543210", "++919876543210"])(
    "rejects %s",
    (input) => expect(() => normalizePhone(input)).toThrow(),
  );
  it("creates national-number email", () =>
    expect(phoneEmail("919876543210", "phonemail.com")).toBe(
      "9876543210@phonemail.com",
    ));
});
describe("JWT", () => {
  it("signs and verifies a seven-day identity", () => {
    const t = signToken(1);
    expect(verifyToken(t)).toBe("1");
    const p = jwt.decode(t) as jwt.JwtPayload;
    expect(p.exp! - p.iat!).toBe(604800);
  });
  it("rejects tampered and expired tokens", () => {
    expect(() => verifyToken(signToken(1) + "bad")).toThrow();
    expect(() =>
      verifyToken(jwt.sign({ sub: "1" }, config.JWT_SECRET, { expiresIn: -1 })),
    ).toThrow();
  });
});
