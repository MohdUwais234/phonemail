import { AppError } from "../errors.js";
export function normalizePhone(input: string): string {
  const value = input.trim().replace(/[\s()-]/g, "");
  if (!/^(?:\+91|91)?\d{10}$/.test(value))
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Enter a 10-digit Indian phone number.",
    );
  return `+91${value.slice(-10)}`;
}
export function phoneEmail(phone: string, domain: string) {
  return `${normalizePhone(phone).slice(-10)}@${domain}`;
}
