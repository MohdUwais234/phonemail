# Architecture and engineering decisions

## Boundaries

- Routes attach middleware and delegate; controllers validate/translate HTTP; services perform business operations; database adapters execute parameterized SQL.
- `AuthService` depends on `OtpProvider`. `TwilioOtpProvider` delegates generation, SMS, and verification entirely to Verify. `DevOtpProvider` refuses production, generates cryptographically random codes, stores HMAC hashes, checks expiration/attempt limits under a row lock, and atomically consumes successful challenges.
- `MailService` handles all mailbox operations; HTTP handlers do not query mail tables directly. Owner IDs come from verified JWTs, never request bodies.
- `InboundService` is provider-neutral. A future SES/Mailgun/SendGrid adapter must validate its provider signature, normalize MIME/multipart input, and call this service through the secret-authenticated endpoint.
- SMTP is an adapter (`MailTransport`) with Nodemailer as the real implementation. Tests can inject failures without contacting the internet.

## Data model

A logical message and a user's mailbox view are different resources:

- `users`: unique canonical E.164 Indian phone and unique generated address.
- `messages`: immutable sent content, editable draft content; sender, plain text/optional HTML storage, RFC message ID, external ID, in-reply-to, thread UUID, timestamps.
- `message_recipients`: recipient address and optional local user reference; relational structure allows multiple recipients later, while the API currently accepts one.
- `mailbox_entries`: owner, logical message, folder, read flag, received/deleted timestamps. **API email IDs are entry IDs**, not logical UUIDs.
- `dev_otps`: keyed code hash, expiry, attempt count, cooldown timestamp. No plaintext database codes.
- `inbound_receipts`: unique external Message-ID + local recipient for replay prevention, retained even after mailbox deletion.
- `mail_outbox`: persistent external recipient, pending/sent/failed state, attempt counter, next attempt, safe error category.
- `schema_migrations`: applied numbered migration filenames. Migrations run inside a transaction protected by a PostgreSQL advisory lock. Add new migrations; do not edit applied production files.

Inbox/Sent entries reference the same message/thread for local delivery. Deleting one owner's copy cannot remove another owner's content. Self-delivery retains separate Inbox/Sent copies; moving both to Trash merges the owner's redundant trash copy. Permanent removal deletes a mailbox entry; underlying content is deleted only when there are no remaining entries or outbox references. **Production retention/purging of completed outbox/message records still needs an explicit policy.**

## Transactions and failure semantics

- Local send creates message + recipient + sender Sent + recipient Inbox atomically, without SMTP.
- An unknown address under the configured PhoneMail domain is rejected, not routed externally.
- External send creates Sent + outbox atomically and returns `delivery: queued`. Sent means submitted, not guaranteed internet delivery.
- Worker polls every two seconds, selects one due row with `FOR UPDATE SKIP LOCKED`, sends over SMTP, and records success. On failure it retries with 1/2/4/8-minute delays; the fifth failure marks `failed`. Detail/list expose `delivery_status` scoped to an owned message.
- SMTP runs while the selected row is transaction-locked. This simple first-release design prevents concurrent workers from claiming the same job but occupies a database connection during I/O. Transport timeouts bound this. Higher throughput should use a leased queue/worker pool.
- SMTP is **at-least-once**, not exactly-once. If SMTP accepts and the worker crashes before commit, retry may deliver a duplicate. Message-ID stays stable. User send requests do not yet have idempotency keys; do not blindly auto-retry ambiguous send failures.
- Draft update/send locks the caller's draft entry and verifies folder before mutating shared content. Sending transitions the same entry out of Drafts, preventing concurrent double-send of a draft.
- Reply locks and checks ownership, copies thread ID, and uses the external Message-ID for inbound mail (local RFC ID otherwise).
- Inbound deduplication and mailbox insertion share a transaction. Replays return `duplicate: true`. Thread references are honored only when the recipient already owns the referenced message.

## Identity/security

- Normalization accepts national 10 digits, `91` + 10 digits, or `+91` + 10 digits, with common spacing/hyphens/parentheses. It deliberately does not restrict mobile-number starting digits, allowing the specified synthetic acceptance accounts.
- JWTs: HS256 only; validated issuer/audience; numeric string `sub`; seven-day expiration. Signing is server-side. Every message query contains the authenticated owner predicate. Unauthorized IDs return 404 instead of confirming another user's resource.
- Helmet, exact-origin CORS, 150 KB JSON limit, Zod validation, parameterized queries, consistent safe errors, request/OTP rate limits. Stack traces and raw provider/SMTP credentials are not returned.
- Development OTP codes may be logged **only when explicitly enabled** and never returned from endpoints. Access to development logs grants temporary sign-in capability; do not expose them publicly.
- Native bearer token is AES-GCM encrypted, with keys managed by Android Keystore. Android backup is disabled. Release builds reject cleartext networking. An explicit debug build option permits mixed content, with a debug-only network-security XML restricting cleartext to localhost, 127.0.0.1 and the emulator host (10.0.2.2), used only for USB/emulator development. Web uses per-tab sessionStorage; it is not as strong as HttpOnly cookies against XSS. Logout deletes local credentials; it does not revoke an already-stolen JWT. Revocation/refresh tokens are future hardening.
- Email bodies are displayed as React text, never `dangerouslySetInnerHTML`. HTML rendering and attachments are intentionally absent.
- Current rate limit storage is in-memory, per API process. Proxy trust is disabled. Behind a proxy, users may share a rate-limit bucket. Configure exact trusted proxy hops and a shared rate-limit store before scaling; never blindly trust all `X-Forwarded-For` values.
- Placeholder secrets and dev OTP are rejected for `NODE_ENV=production`. `.env` and signing keys are ignored by Git. Do not put secrets in `VITE_*` variables; those are public build values.

## Client architecture

`AuthProvider` centralizes restore/login/logout/profile state. `api.ts` is the only fetch layer: typed functions, bearer attachment, timeout/network errors, consistent API errors, and a global 401 transition to sign-in. Screens use local state and reusable buttons, avatar, modal, spinner, empty/error states and composer.

Capacitor wraps the exact Vite build. Remote native builds use an absolute HTTPS `VITE_API_URL`; the default debug APK uses loopback with `adb reverse` to a local Docker API. Web uses relative `/api` and a reverse proxy, never browser-facing localhost backend calls in the preview. The Vite server proxy uses an internal address only on the server side.

The service worker precaches static application assets only. API routes are excluded from navigation fallback and never cached. Fonts are locally bundled. Web offline mode can launch the shell but cannot load or send messages.

## Tests / developer infrastructure

Docker Compose orchestrates PostgreSQL 16, API, MailHog, web, and opt-in Node/test containers. Database health gates API startup. The Node tool wrapper removes the Windows host Node requirement. The separate Android preparation script binds dependencies into the host filesystem for Android Studio/Gradle.

Database tests require the literal database name `phonemail_test` when a server URL is supplied. Each suite creates a randomized schema and removes **only its own schema**. Without a server URL, PGlite runs PostgreSQL's engine in an isolated in-memory instance. Real-server CI validates driver differences, transactions and SMTP through MailHog. Browser tests obtain dev OTPs from restricted test-run logs, not API backdoors.

## Future SMS / IVR / attachments

SMS and IVR should be separate use cases with SMS/Voice gateway ports, invoked after authorization and persisted as their own jobs. Reuse the normalized identity, users and audit infrastructure, not mail route handlers. Do not reuse OTP verification endpoints as an arbitrary messaging API. Twilio implementation details stay behind adapters. Attachments can reference `messages.id` with a separate metadata table and object-storage adapter, validation/scanning and ownership checks. No unfinished fake integrations are exposed in the UI.
