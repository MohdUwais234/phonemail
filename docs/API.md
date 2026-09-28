# PhoneMail API

Base URL for local development: `http://localhost:3000`. Web dev proxy: `/api`. Use **`curl.exe` on PowerShell**, not its `curl` alias. Examples use PowerShell `$token`; on POSIX shells use `curl` and `$TOKEN`.

On older Windows PowerShell versions that strip native argument quotes, save the JSON to `request.json` and replace `--data-raw '{...}'` with `--data-binary '@request.json'`. The inline examples work with modern PowerShell native argument passing.

## Conventions

- JSON request/response; `Content-Type: application/json` for bodies.
- Mail/profile requests require `Authorization: Bearer <JWT>`.
- IDs are strings on the wire; treat them as opaque. Email ID = owned mailbox-entry ID, `logical_id` = shared message UUID.
- Dates use ISO timestamps. Folder enum: `INBOX`, `SENT`, `DRAFTS`, `TRASH`.
- Optional properties default as stated below. One recipient per send.
- Errors have `{ "error": "CODE", "message": "Safe explanation" }`. Validation may add `fields: [{path,message}]`.

| HTTP | Codes / circumstances                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| 400  | `VALIDATION_ERROR`, `INVALID_OTP`; malformed JSON, invalid ID/fields, editing non-draft                            |
| 401  | `UNAUTHORIZED`; missing, expired, tampered JWT, missing user, wrong webhook secret                                 |
| 404  | `NOT_FOUND`, `MESSAGE_NOT_FOUND`, `EMAIL_NOT_FOUND`; unknown route, absent/unowned message, absent local recipient |
| 413  | `VALIDATION_ERROR`; JSON exceeds 150 KB                                                                            |
| 429  | `OTP_RATE_LIMITED`, `RATE_LIMITED`; cooldown, OTP/API IP limits                                                    |
| 500  | `INTERNAL_ERROR`; no stack trace or provider secrets                                                               |
| 503  | `OTP_UNAVAILABLE`; missing Twilio configuration or unavailable provider                                            |

Global limits: 180 requests/minute/IP. OTP requests: 5 per 15 minutes/IP; verification: 20 per 15 minutes/IP. Dev challenge: 60-second cooldown, five-minute expiry, five code attempts. Headers include standard rate-limit metadata.

## Authentication

### POST `/auth/otp/request`

Public. Body: `{ "phoneNumber": "+919876543210" }`. Accepts the documented national/prefixed forms, normalized before processing. No query parameters.

200: `{ "message": "Verification code sent.", "retryAfter": 60, "expiresIn": 300 }`.

Errors: 400 invalid phone, 429 limits/cooldown, 503 provider configuration/unavailability. **Never returns an OTP.**

```powershell
curl.exe -X POST http://localhost:3000/auth/otp/request -H 'Content-Type: application/json' --data-raw '{"phoneNumber":"9876543210"}'
```

### POST `/auth/otp/verify`

Public. Body: `{ "phoneNumber": "+919876543210", "code": "123456" }`. Exactly six digits; no query parameters.

200:

```json
{
  "message": "OTP verified successfully",
  "token": "<seven-day JWT>",
  "user": {
    "id": "1",
    "phone_number": "+919876543210",
    "email_address": "9876543210@phonemail.com",
    "display_name": null,
    "created_at": "2026-09-28T00:00:00.000Z",
    "updated_at": "2026-09-28T00:00:00.000Z"
  }
}
```

Errors: 400 invalid/expired/used code or malformed input, 429 rate limit, 503 provider failure. Existing normalized identities are reused.

```powershell
curl.exe -X POST http://localhost:3000/auth/otp/verify -H 'Content-Type: application/json' --data-raw '{"phoneNumber":"9876543210","code":"123456"}'
# Set $token to the token from this successful response, not the literal placeholder.
```

### GET `/auth/me`

Bearer required. No body/query. 200: user object above. 401 missing/invalid token or missing account.

```powershell
curl.exe http://localhost:3000/auth/me -H "Authorization: Bearer $token"
```

### PATCH `/auth/me`

Bearer required. Body: `{ "display_name": "Alex" }`, string up to 80 characters; trimmed empty string clears the name. Phone/address are immutable. No query. 200: updated user. Errors: 400/401.

```powershell
curl.exe -X PATCH http://localhost:3000/auth/me -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-raw '{"display_name":"Alex"}'
```

## Mailbox

All endpoints below require Bearer auth and return 401 if missing/invalid. No user-ID parameter is accepted as an authorization source. Every ID operation returns 404 for an absent **or another user's** mailbox entry.

### Mail object

```json
{
  "id": "42",
  "logical_id": "668c82e2-2e19-49ee-b20a-967b053d6c87",
  "folder": "INBOX",
  "is_read": false,
  "from": "1111111111@phonemail.com",
  "fromName": "Alex",
  "to": "2222222222@phonemail.com",
  "subject": "Hello",
  "body": "How are you?",
  "message_id": "<668c82e2-2e19-49ee-b20a-967b053d6c87@phonemail.com>",
  "external_message_id": null,
  "in_reply_to": null,
  "thread_id": "668c82e2-2e19-49ee-b20a-967b053d6c87",
  "received_at": "2026-09-28T00:00:00.000Z",
  "sent_at": "2026-09-28T00:00:00.000Z",
  "deleted_at": null,
  "delivery_status": null
}
```

Additional storage fields/timestamps may be present. `delivery_status` is `pending`, `sent`, `failed` for external SMTP jobs; null for internal/draft/inbound mail. SMTP `sent` means **accepted by the outgoing server**, not proof that the destination read/received it.

### GET `/emails`

Query: `folder` defaults INBOX; `page` integer 1–100000, default 1; `limit` integer 1–100, default 20. No body.

200: `{ "messages": [<mail objects>], "page": 1, "limit": 20, "total": 12, "unread": 3 }`. Count/unread refer to the requested folder. Stable descending received-time/entry-ID ordering. Empty/out-of-range pages return an empty list. Errors: 400 bad query, 401.

```powershell
curl.exe 'http://localhost:3000/emails?folder=INBOX&page=1&limit=20' -H "Authorization: Bearer $token"
```

### GET `/emails/folder/:folder`

Equivalent folder path form; path takes precedence over a folder query. Same pagination, response and errors.

```powershell
curl.exe 'http://localhost:3000/emails/folder/SENT?page=1&limit=20' -H "Authorization: Bearer $token"
```

### GET `/emails/:id`

Owned entry ID. No query/body. 200: mail object. Does not itself mark read; use PATCH below. Errors: 400 malformed ID, 401, 404.

```powershell
curl.exe http://localhost:3000/emails/42 -H "Authorization: Bearer $token"
```

### POST `/emails`

Body:

```json
{
  "to": "2222222222@phonemail.com",
  "subject": "Hello",
  "body": "A message",
  "draftId": "17"
}
```

`to`: one valid email (max 254); `subject`: optional, max 998, default empty; `body`: optional, max 100000, default empty; `draftId`: optional existing owned draft to transition to Sent. Sender always comes from authenticated user. No query.

201: mail object in SENT plus `delivery: "delivered"` for internal mail or `"queued"` for external. The external outbox is durable before returning. Unknown local-domain recipients are 404. Invalid to/draft state: 400; unowned/absent draft: 404; missing auth: 401. General DB failure: 500. SMTP failures happen asynchronously and update `delivery_status`.

```powershell
curl.exe -X POST http://localhost:3000/emails -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-raw '{"to":"2222222222@phonemail.com","subject":"Hello","body":"A message"}'
```

### POST `/emails/draft`

Same fields; `to` may be empty. Provide `draftId` to update, omit to create. No query. 201: owned mail object in DRAFTS with `delivery: "draft"`. Partial drafts are private. Errors: 400/401/404. Send through POST `/emails` with that `draftId`; delete through DELETE below.

```powershell
curl.exe -X POST http://localhost:3000/emails/draft -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-raw '{"to":"","subject":"For later","body":"Working on it"}'
curl.exe -X POST http://localhost:3000/emails/draft -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-raw '{"draftId":"17","to":"to@example.com","subject":"Ready","body":"Updated"}'
```

### POST `/emails/:id/reply`

Body: `{ "body": "Thanks!" }`, required 1–100000 characters. No query. Original entry must be owned and not Drafts. Destination and Re: subject are derived server-side; thread and In-Reply-To are preserved. Replying to your own sent message targets its recipient.

201: new SENT mail object plus delivered/queued state. Errors: 400 malformed/empty body or draft original, 401, 404 unowned/missing original or nonexistent local recipient.

```powershell
curl.exe -X POST http://localhost:3000/emails/42/reply -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-raw '{"body":"Thanks!"}'
```

### PATCH `/emails/:id/read`

Body: `{ "isRead": true }` or false; an empty object defaults true. No query. 200: updated owned mail object. Errors: 400 invalid boolean/ID, 401, 404.

```powershell
curl.exe -X PATCH http://localhost:3000/emails/42/read -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-raw '{"isRead":true}'
```

### DELETE `/emails/:id`

No body/query. First call moves this owner's entry to TRASH. If already TRASH, permanently removes it from this owner's mailbox. Other owners keep their copies. No restore endpoint yet.

200: `{ "message": "Message moved to trash." }` or `{ "message": "Message permanently removed from your mailbox." }`. Errors: 400/401/404.

```powershell
curl.exe -X DELETE http://localhost:3000/emails/42 -H "Authorization: Bearer $token"
```

## Inbound email

### POST `/webhooks/inbound-email`

No JWT. **Requires `X-Webhook-Secret`** matching server configuration; constant-time digest comparison. No query.

```json
{
  "from": "alice@example.com",
  "fromName": "Alice",
  "to": "9876543210@phonemail.com",
  "subject": "Hello",
  "text": "Hello there",
  "messageId": "<abc@example.com>",
  "inReplyTo": "<previous@example.com>"
}
```

`from`, `to`: valid email max 254; `fromName`: optional max 100; `subject`: required max 998; `text`: required max 100000; `messageId`: required 1–998; `inReplyTo`: optional max 998. No HTML rendering/attachments.

200: `{ "message": "Email received.", "duplicate": false }`, replay `{ "message": "Already ingested.", "duplicate": true }`. Deduplication key is external ID + local recipient. External ID is preserved in `external_message_id`; an internal RFC ID is assigned for unique storage, and replies reference the external ID.

Errors: 401 absent/wrong secret; 400 invalid normalized payload; 404 unknown PhoneMail recipient; 429 global limit. Provider signature verification, raw MIME and provider-native webhook formats require adapters before public deployment.

```powershell
# Set $webhookSecret from your private .env, do not paste it into source control.
curl.exe -X POST http://localhost:3000/webhooks/inbound-email -H "X-Webhook-Secret: $webhookSecret" -H 'Content-Type: application/json' --data-raw '{"from":"alice@example.com","fromName":"Alice","to":"9876543210@phonemail.com","subject":"Hello","text":"Hello there","messageId":"abc@example.com"}'
```

## Health

### GET `/health`

Public. No body/query. Performs PostgreSQL `SELECT 1`. 200: `{ "status": "ok", "database": "connected" }`; 503: `{ "status": "unavailable", "database": "disconnected" }`.

```powershell
curl.exe http://localhost:3000/health
```

### GET `/health/integrations`

Public. No body/query. Configuration-only; does not contact Twilio or SMTP. 200:

```json
{
  "otp": { "provider": "twilio", "configured": false },
  "smtp": { "configured": true },
  "inbound": { "configured": true }
}
```

No credentials or OTPs returned; configured does **not** prove provider connectivity or account permission.

```powershell
curl.exe http://localhost:3000/health/integrations
```
