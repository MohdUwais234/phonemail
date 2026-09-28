import type { User, Folder, MailPage, Email, ComposeData } from "./types";
const base = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
let token: string | null = null;
let onUnauthorized = () => {};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function configureAuth(value: string | null, handler?: () => void) {
  token = value;
  if (handler) onUnauthorized = handler;
}
async function request<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Unable to connect. Check your connection and try again.",
    );
  }
  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "SERVER_ERROR",
      "The server returned an unexpected response.",
    );
  }
  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized();
    throw new ApiError(
      response.status,
      json.error || "REQUEST_FAILED",
      json.message || "Something went wrong. Please try again.",
    );
  }
  return json as T;
}
export const api = {
  requestOtp: (phoneNumber: string) =>
    request<{ retryAfter: number; expiresIn: number }>(
      "/auth/otp/request",
      "POST",
      { phoneNumber },
    ),
  verifyOtp: (phoneNumber: string, code: string) =>
    request<{ token: string; user: User }>("/auth/otp/verify", "POST", {
      phoneNumber,
      code,
    }),
  me: () => request<User>("/auth/me"),
  profile: (display_name: string) =>
    request<User>("/auth/me", "PATCH", { display_name }),
  list: (folder: Folder, page = 1) =>
    request<MailPage>(`/emails?folder=${folder}&page=${page}&limit=20`),
  email: (id: string) => request<Email>(`/emails/${id}`),
  send: (data: ComposeData) => request<Email>("/emails", "POST", data),
  draft: (data: ComposeData) => request<Email>("/emails/draft", "POST", data),
  reply: (id: string, body: string) =>
    request<Email>(`/emails/${id}/reply`, "POST", { body }),
  read: (id: string, isRead: boolean) =>
    request<Email>(`/emails/${id}/read`, "PATCH", { isRead }),
  remove: (id: string) =>
    request<{ message: string }>(`/emails/${id}`, "DELETE"),
};
