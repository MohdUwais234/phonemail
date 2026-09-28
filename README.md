# PhoneMail

**Your number. Your inbox. Simply yours.**

PhoneMail is a mobile-first email application with phone-number identity. An Indian number such as `+919876543210` becomes `9876543210@phonemail.com`. Sign in using a six-digit verification code—no email username or password to create.

One React application powers the **Capacitor Android app** and the **web/PWA client**. This is a functional first release, **not a claim of production readiness or ownership of phonemail.com**. Public internet mail requires domain, DNS, and provider configuration.

**Tested Android APK:** [Download the debug artifact](https://github.com/MohdUwais234/PhonemailAI/actions/runs/36401613291/artifacts/10960273948) (GitHub sign-in may be required). For the default USB-local build, start Docker and run `adb reverse tcp:3000 tcp:3000` after installing. Native emulator acceptance and backend/browser CI passed; see [verification evidence](docs/STATUS.md).

## What is included

- OTP login: Twilio Verify adapter and a development-only, hashed, expiring, single-use OTP provider.
- Seven-day JWTs; authenticated profile and display-name editing.
- Inbox, Sent, Drafts, Trash, compose, reply, read/unread, pagination, and page-local search.
- Transactional internal delivery; private editable drafts; per-user trash and permanent removal.
- Persistent SMTP outbox, retry/backoff, and visible delivery status; MailHog for local email.
- Authenticated, deduplicated normalized inbound webhook and basic threading.
- Android project, encrypted native credential storage, app icons/splash, PWA manifest and app-shell caching.
- Docker tooling for Windows without host Node/npm, automated tests, and APK/browser CI workflows.

## Architecture

```text
React + TypeScript + Vite  ── Capacitor / Android
          │                  or browser / PWA
          └── typed API client + JWT
                       │
             Express routes → controllers → services
                       │                  ├── Twilio Verify
                 PostgreSQL 16           └── SMTP outbox → SMTP / MailHog
                       ↑
              authenticated inbound webhook
```

See [Architecture](docs/ARCHITECTURE.md), [API reference](docs/API.md), and [verified status and limitations](docs/STATUS.md).

## Requirements

- Docker Desktop with **Linux containers** and Docker Compose v2.
- Git and PowerShell. **Node/npm are not required on Windows.**
- For local APK compilation only: Android Studio, SDK 35, JDK 21. Alternatively download the CI artifact.
- Internet access for Docker images/dependencies and Twilio, if enabled.

## Quick start — Windows / PowerShell

```powershell
git clone https://github.com/MohdUwais234/PhonemailAI.git
cd PhonemailAI
# Until merged, the implementation is on this branch:
git switch arena/01a0e723-phonemailai
Copy-Item .env.example .env
notepad .env
```

For local testing set:

```dotenv
OTP_PROVIDER=dev
DEV_OTP_LOG=true
```

Replace both placeholder secrets in `.env`. A Docker-only secret generator is:

```powershell
docker run --rm node:22-bookworm-slim node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it twice; use separate outputs for `JWT_SECRET` and `INBOUND_WEBHOOK_SECRET`. Never commit `.env`.

```powershell
.\scripts\dev.ps1
# Equivalent foreground command:
docker compose up --build
```

| Service                   | URL                                                |
| ------------------------- | -------------------------------------------------- |
| PhoneMail web             | http://localhost:5173                              |
| API health                | http://localhost:3000/health                       |
| Integration configuration | http://localhost:3000/health/integrations          |
| MailHog outgoing inbox    | http://localhost:8025                              |
| PostgreSQL                | localhost:5432; development credentials in Compose |

PostgreSQL data lives in the `postgres_data` volume. Startup applies **numbered, additive migrations**. `docker compose down` stops services without deleting the database. **Do not use `down -v` on data you need.**

The Compose file is for local development: its database password and exposed development services must not be used as a production deployment.

## Try the application

### Development OTP (no actual SMS)

1. Enter a 10-digit number, such as `1111111111`.
2. Click Continue.
3. Read the code from **local Docker logs**, not the API:

   ```powershell
   docker compose logs --tail 30 backend
   ```

4. Enter the six digits. The account is created and the inbox opens.

Development OTPs expire after five minutes, allow five verification attempts, and have a 60-second resend cooldown. Only keyed hashes are stored. Request endpoints also limit requests per IP. Logs containing development OTPs are sensitive: do not publish them. The dev provider is refused when `NODE_ENV=production`.

### Two-user internal email

Use two independent browser contexts (normal and private window), or log out and sign in again:

- Account A: `1111111111` → `1111111111@phonemail.com`
- Account B: `2222222222` → `2222222222@phonemail.com`

Create both accounts. Send from A to B. A sees Sent; B sees Inbox after Refresh. Internal delivery does **not** use SMTP. A missing `@phonemail.com` recipient returns `EMAIL_NOT_FOUND`; it is never silently routed externally.

### External email

Send to `to@example.com`. The UI reports queued delivery, then the outbox worker submits through SMTP. Open **http://localhost:8025** to inspect the message. MailHog captures email locally; it does **not** deliver to the real internet. Detail view reports queued, accepted by SMTP, or failed after retries.

### Inbound email

[API.md](docs/API.md#inbound-email) includes an authenticated `curl.exe` example. The webhook accepts normalized JSON; provider-specific multipart/MIME adapters are not implemented.

**Localhost cannot receive arbitrary internet email.** Public inbound requires a domain you control, DNS MX records, an inbound provider (Mailgun, SendGrid Inbound Parse, or Amazon SES), and a public HTTPS adapter that forwards normalized, authenticated data to PhoneMail.

## Configure Twilio Verify

In `.env`:

```dotenv
OTP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_VERIFY_SERVICE_SID=your-verify-service-sid
```

Create a Verify Service in the Twilio console, configure SMS destinations/geographic permissions, and restart the backend:

```powershell
docker compose up -d --force-recreate backend
```

Twilio—not PhoneMail—generates, sends, and checks production OTPs. Trial accounts may require the destination number to be a **verified tester**. Account billing/region restrictions are provider configuration issues. Useful client messages are returned without exposing credentials. `/health/integrations` reports configuration only and **never sends an OTP**. Live Twilio SMS cannot be verified without a configured account and destination phone.

## Docker-only npm and tests

```powershell
.\scripts\npm.ps1 ci
.\scripts\npm.ps1 run typecheck
.\scripts\npm.ps1 test
.\scripts\npm.ps1 run build
.\scripts\test.ps1
```

- `npm.ps1 test` runs isolated PostgreSQL-engine tests using PGlite (no server required).
- `test.ps1` uses **PostgreSQL 16 / phonemail_test**, a randomized schema per suite, and real SMTP through MailHog. It never resets the development database.
- Unit/integration coverage includes phone normalization, OTP expiration/replay/attempt limits, JWT verification, user creation, ownership on every ID endpoint, drafts, internal delivery, threading, pagination, read/unread, trash, webhook authentication/deduplication, migration idempotence, SMTP retries and real MailHog acceptance.
- **Browser acceptance** in GitHub Actions starts the actual Docker stack and exercises mobile-sized OTP → mailbox → draft → send → reply → trash → profile → logout/session expiration. No mocked mail API or hardcoded OTP.
- Linux/macOS equivalent: `./scripts/npm.sh test`.

If tests cannot reach Docker/SMTP, the fast test command is still useful but does not replace the real-service workflow. Detailed test evidence is tracked in [STATUS.md](docs/STATUS.md).

## Android APK

### Recommended: GitHub Actions

1. For USB-local testing, use the default build (`http://127.0.0.1:3000`). For remote access, deploy an **HTTPS** API.
2. Optionally set repository Actions variable `PHONEMAIL_API_URL`, e.g. `https://api.your-domain.example` (not a secret), or run **Android APK** manually with the `api_url` input.
3. Download `phonemail-debug-apk` from the workflow artifacts.
4. Install:

   ```powershell
   adb install -r app-debug.apk
   # For the default USB-local debug build, with Docker backend running:
   adb reverse tcp:3000 tcp:3000
   ```

The workflow builds/syncs with Node 22 **inside Docker**, compiles with JDK 21 and SDK 35, and uploads the APK. Default debug builds connect through USB `adb reverse` to your PC’s Docker API. Native emulator acceptance exercises the actual WebView and encrypted-session restore against the Docker API. When configured for a remote API, the workflow only verifies launch and deliberately does not send real SMS.

### Local Android Studio (no host Node)

```powershell
.\scripts\android.ps1  # default: USB-local debug API
# Or configure a deployed HTTPS API:
.\scripts\android.ps1 -ApiUrl "https://your-api.example"
```

This script runs `npm ci`, Vite build, and Capacitor sync inside Docker. Unlike the regular npm helper, it materializes `node_modules` into the checkout so **host Gradle can read native plugin Java sources**. Then:

1. Open **`web/android`** in Android Studio.
2. Select Gradle JDK 21, install Android SDK 35, and let Gradle sync.
3. Build → Build APK(s), or:

   ```powershell
   cd web\android
   .\gradlew.bat assembleDebug
   ```

4. APK: `web/android/app/build/outputs/apk/debug/app-debug.apk`.

For Docker-only synchronization separately: `scripts/npm.ps1 run build` then `scripts/npm.ps1 run android:sync`. Use `android.ps1` before opening host Android Studio, because Compose’s regular dependency volume is not visible to host Gradle.

`VITE_API_URL` is compiled into the frontend. Use `/api` for web development (Vite proxies it). Android supports an absolute reachable HTTPS API or the explicitly enabled local-debug loopback address. A phone's `localhost` is **the phone**: `adb reverse tcp:3000 tcp:3000` forwards it over USB to your PC. Enable USB debugging and reconnect the reverse mapping after device reboots. Debug-only network security permits cleartext **only** for loopback/emulator-host addresses; release manifests reject it. Do not ship a loopback-configured release. For remote devices use HTTPS and keep `https://localhost` in `CORS_ORIGINS`. Release signing/Play Store distribution are separate manual steps; this project produces a debug APK.

## Web / PWA

The same client runs at port 5173. Production web assets are in `web/dist`. Serve them over HTTPS with SPA fallback and proxy `/api/*` to the backend (strip `/api`). The manifest includes install icons. Only static app assets are cached: **mailboxes and tokens are not put in Cache Storage**. Offline mail synchronization is not implemented.

Web tokens use `sessionStorage` (survive refresh, not closing the tab), rather than long-lived localStorage. Native tokens use AES-GCM with Android Keystore. Browser JavaScript storage is still vulnerable to XSS; a future hardened web deployment should use a same-origin BFF with HttpOnly cookies. HTML email is not rendered.

## Production checklist and boundaries

Before a public launch, provide:

- Owned domain; outbound SMTP; verified sender domain; SPF, DKIM and DMARC; inbound DNS MX and provider integration.
- Paid/configured Twilio Verify with supported destinations; independent high-entropy secrets; managed secret injection.
- HTTPS; exact CORS allowlist; reverse-proxy configuration; replace Vite’s development server with hardened static hosting.
- Managed PostgreSQL credentials/network isolation, encrypted backups, restore drills, observability and alerting for failed outbox jobs.
- Distributed rate limiting and trusted-proxy/IP design for multi-instance deployments. Current rate limiting is in-process and `trust proxy` is deliberately disabled.
- Sender abuse/spam controls, mail quotas, privacy/retention policy, phone-number recycling/account recovery, deletion workflows, and an independent security review.
- Release signing, Android device QA, accessibility review and Play Store requirements.

A phone-number email address reveals that number to recipients; make this clear in your privacy/onboarding policy. Scope is currently **India-only, one recipient per message, plain text**, without attachments, push notifications, SMS inbox, or IVR. We do not fake those features. SMTP is at-least-once; a crash after SMTP acceptance can duplicate a send. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for operational details.

## Repository map

```text
backend/src/        Express API, auth, services, PostgreSQL, SMTP worker
backend/tests/      unit and API/database integration tests
web/src/            shared React screens and API/auth/storage layers
web/android/        generated and branded Capacitor Android project
database/           numbered migrations and test-database initialization
scripts/            Docker-only PowerShell and POSIX helpers
tests/e2e/          real mobile browser journeys
.github/workflows/  PostgreSQL/SMTP checks, browser tests, APK + emulator smoke
docs/               API reference, architecture, verified release status
```
