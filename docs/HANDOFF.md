# PhoneMail Engineering Handoff

See the handoff summary delivered in the Arena session (Sept 30, 2026). Key facts:

- Branch: `arena/01a0e723-phonemailai`, latest commit `26d1a1b` (pushed). `main` is the empty initial commit.
- Verified checkpoints: 32/32 backend tests in Docker CI; 2/2 browser E2E; Android emulator acceptance passed (run 36401613291, APK artifact 10960273948); 56 tests pass locally after Twilio hardening (1 MailHog test skipped without server).
- Not done: live Twilio credentials/SMS test, running `scripts/setup-twilio.ps1` on Windows, production HTTPS/SMTP/inbound provider, release signing, physical-device QA.
- Secrets posted in chat by the owner (JWT/webhook) are compromised; generate fresh ones (`setup-twilio.ps1 -RotateAppSecrets`).
- Rules: never commit `.env`; Windows workflow is Docker-only; identity always from JWT; no destructive git/DB ops without approval.

Full details: README.md, docs/TWILIO.md, docs/API.md, docs/ARCHITECTURE.md, docs/STATUS.md.
