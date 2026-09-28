# Implementation and verification status

Last reviewed: **2026-09-28**. Branch: `arena/01a0e723-phonemailai`.

This is a working first-release codebase with an APK pipeline, **not a public production email service**. No Twilio account, real domain, production SMTP, or public inbound provider was supplied. Those external services were not claimed as tested.

## Verified

| Area                               | Evidence                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend TypeScript, web TypeScript | `npm run typecheck` passes                                                                                                                                                              |
| API/database integration           | 31 unit/integration tests pass locally against PostgreSQL 16.14; also pass on isolated PGlite                                                                                           |
| Real outgoing SMTP                 | Additional MailHog acceptance test passes in Docker CI (32 backend tests total)                                                                                                         |
| Docker                             | GitHub CI built the production backend image and started the actual Compose stack                                                                                                       |
| Browser                            | Two Playwright tests pass both locally and in Docker CI; real API/database, no fake OTP endpoint                                                                                        |
| Mobile browser journey             | OTP, persistence after refresh, empty inbox, save/resume/send draft, internal delivery, Sent, reply, read/unread, two-stage deletion, profile, logout and expired session               |
| Responsive layouts                 | Browser checks at 360, 412, 768, 1440 pixels; no horizontal overflow                                                                                                                    |
| Migration safety                   | Re-running migrations preserves existing users; real-server suites use disposable schemas in `phonemail_test` only                                                                      |
| Ownership                          | Tested denial of foreign read, delete, read-state mutation, reply, draft read/update/send; per-owner deletion and self-delivery edge case                                               |
| Inbound                            | Secret rejection, normalized ingestion, deduplication, external Message-ID reply reference                                                                                              |
| Resilient delivery                 | Transactional outbox, delayed retry after failure, safe error category, pending/sent/failed detail status                                                                               |
| Build / PWA                        | Backend and Vite production builds pass; PWA includes app shell, local fonts and icons, no API caching                                                                                  |
| Android source                     | Full Capacitor project, package `com.phonemail.app`, SDK 35/JDK 21 configuration, Keystore storage, branded launch resources                                                            |
| Android APK and native acceptance  | Compiled, uploaded, installed and tested on an API 35 emulator: real WebView OTP, save/resume/send draft, Sent, internal delivery/reply, encrypted session after force-stop, and logout |
| Formatting / dependency audit      | Prettier check passes; `npm audit` reports zero known vulnerabilities at review time                                                                                                    |

### CI evidence

- [PostgreSQL + MailHog + build checks](https://github.com/MohdUwais234/PhonemailAI/actions/runs/36401612830): passed.
- [Real Docker browser journeys](https://github.com/MohdUwais234/PhonemailAI/actions/runs/36401612835): passed.
- [APK and connected native Android acceptance](https://github.com/MohdUwais234/PhonemailAI/actions/runs/36401613291): **passed**, including backend connectivity, internal mail and encrypted session restoration after force-stop.
- [Download tested debug APK artifact](https://github.com/MohdUwais234/PhonemailAI/actions/runs/36401613291/artifacts/10960273948). This is the USB-local build; run Docker and `adb reverse tcp:3000 tcp:3000`. Older HTTPS-placeholder artifacts were compile/launch checks only.

## Android local development

Default new debug APKs connect to `http://127.0.0.1:3000` through `adb reverse tcp:3000 tcp:3000`, with the Docker API running on your PC. Only the debug source set allows cleartext to explicitly listed loopback/emulator addresses; release builds remain cleartext-blocked. For remote use, set `PHONEMAIL_API_URL` to a real HTTPS API and rebuild.

Android artifacts are in the [Android APK workflow](https://github.com/MohdUwais234/PhonemailAI/actions/workflows/android.yml): `phonemail-debug-apk` and `android-launch-evidence`. APKs and screenshots are artifacts, not committed binaries.

## Sandbox validation details

The initial sandbox had Node but **no Docker, Java, Android SDK or PostgreSQL**. Docker installation/package downloads were blocked. The user explicitly approved sandbox-only Node tooling while keeping the Windows workflow Docker-only. A PostgreSQL 16.14 binary and headless Chromium were obtained separately for local validation; these are outside the Git repository. Docker, MailHog, Gradle and emulator verification ran in GitHub Actions. The live sandbox preview uses development OTP (codes in API process logs), not Twilio SMS; local MailHog is not running in that sandbox.

PowerShell scripts are provided and their underlying Docker commands are covered in CI, but a physical Windows/Android workstation was not available for manual execution. Native physical-device, OEM battery/background behavior and Play Store QA remain manual work.

## Unverified external/manual requirements

- Live Twilio SMS and account/destination permissions (trial tester verification may be required).
- Production domain ownership, DNS MX, SPF/DKIM/DMARC, public SMTP deliverability and spam reputation.
- Inbound-provider-specific MIME/multipart parsing/signature adapter and live internet delivery.
- Production deployment, secrets, TLS termination, backups/restore, observability, abuse prevention and operational alerts.
- Signed release APK/AAB, Play Store publication, hardware devices and accessibility certification.

## Known limitations / intentional scope

- India-only identity; phone-number addresses reveal the phone number to correspondents. Phone recycling and account recovery need a production policy.
- Plain text and one recipient per send; no attachments, CC/BCC, push notifications, offline mail synchronization, SMS inbox or IVR.
- Basic thread metadata/replies, not a grouped conversation UI. Search is explicitly current-page only. No Trash restore endpoint.
- SMTP delivery is queued and at-least-once, with five attempts. No general send idempotency key; users must not blindly retry ambiguous sends. Sent does not guarantee recipient delivery.
- Completed/failed outbox records retain referenced message content after mailbox removal; production retention/purge and account deletion must be implemented according to policy.
- In-memory IP rate limits are single-instance only; reverse-proxy trust is intentionally disabled. Shared limits/trusted proxy topology are required before scaling.
- Web bearer token is tab-scoped sessionStorage, not HttpOnly-cookie protection. Android uses Keystore. Logout does not revoke an already stolen seven-day token.
- No audited production security guarantee, high-availability architecture or public mail hosting is claimed.

## Git / deliverables

The backend, shared client, generated Android project, migrations, Docker scripts, three CI workflows, API/architecture/setup documentation and tests are committed in logical milestones and pushed to the session branch. The original license was preserved; no existing application/data was deleted. Secrets, test output, dependencies and compiled assets are ignored.
