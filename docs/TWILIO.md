# Connect PhoneMail to Twilio Verify

PhoneMail uses **Twilio Verify for SMS sign-in**, not custom-generated production OTPs. The backend requests a code, Twilio generates/sends it, and the backend checks the submitted code with Twilio before creating the account and JWT. Both Android and the web client already use these endpoints.

Twilio credentials belong only in the backend environment. Do not put them in chat, Git, screenshots, Android assets, or any `VITE_*` variable. JWT and inbound-webhook secrets are separate application secrets; they are **not** Twilio credentials. If shared in chat, replace them. Rotating JWT_SECRET signs out existing sessions and invalidates outstanding development-code hashes. Updating INBOUND_WEBHOOK_SECRET requires updating any inbound-email adapter using it.

## 1. Create the Verify service

In the [Twilio Console](https://console.twilio.com/):

1. Select the account/subaccount you will use for PhoneMail.
2. Go to **Verify → Services**, create a service named **PhoneMail**, and enable SMS.
3. Set the code length to **6**. Keep the default ten-minute code validity unless you also adapt the app's countdown. Twilio is the authority for expiry; resending within an active verification does not necessarily extend its lifetime.
4. Copy its **Verify Service SID**, beginning `VA`. Do not use a Messaging Service SID (`MG`), a phone number SID (`PN`), or an individual verification SID (`VE`).
5. Enable the required destination in **Verify geographic permissions** (India for this application). Check account billing and sending restrictions. Trial accounts must use permitted/verified recipient phone numbers.

Use live credentials, not Twilio's test credentials. Account, API key, and Verify service must belong to the same account/subaccount.

## 2. Enter credentials without pasting them in chat

From the repository root in PowerShell:

```powershell
.\scripts\setup-twilio.ps1 -RotateAppSecrets
```

This local script:

- Creates `.env` from `.env.example` only if missing, preserving other settings.
- Prompts for credentials **without echoing them**.
- Supports either authentication option below and clears the unused alternative.
- Sets `OTP_PROVIDER=twilio` and `DEV_OTP_LOG=false`.
- With `-RotateAppSecrets`, generates independent JWT/webhook secrets locally without printing them. Without the flag, it preserves existing non-placeholder secrets.
- Writes to your ignored `.env`. It never sends SMS or automatically restarts a running app.

**Option 1 — Account Auth Token (simplest setup)**

Use the live Account SID and Auth Token from the account dashboard:

```dotenv
OTP_PROVIDER=twilio
DEV_OTP_LOG=false
TWILIO_ACCOUNT_SID=AC_your_actual_account_sid
TWILIO_AUTH_TOKEN=your_live_account_auth_token
TWILIO_VERIFY_SERVICE_SID=VA_your_actual_verify_service_sid
TWILIO_API_KEY_SID=
TWILIO_API_KEY_SECRET=
```

**Option 2 — API key**

Create an API key for the same account. Its permissions must allow Verify service reads, verification creation and verification checks. Save the secret when Twilio shows it; an `SK` key SID is not your `AC` account SID.

```dotenv
OTP_PROVIDER=twilio
DEV_OTP_LOG=false
TWILIO_ACCOUNT_SID=AC_your_actual_account_sid
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=VA_your_actual_verify_service_sid
TWILIO_API_KEY_SID=SK_your_actual_api_key_sid
TWILIO_API_KEY_SECRET=your_actual_api_key_secret
```

The values above are explanatory placeholders, not valid credentials. Actual AC, VA and SK SIDs contain their prefix followed by 32 hex characters. You can also edit `.env` directly with `notepad .env`. When API key fields are present, both are required; an incomplete key never silently falls back to the account token or development OTP.

The `.env` in an Arena workspace is separate from a Windows checkout and is never transferred by Git. Run the setup script on the machine where you run Docker.

## 3. Run a read-only credential/service check

Docker Desktop must be running; Windows needs no Node/npm installation:

```powershell
.\scripts\npm.ps1 ci
.\scripts\npm.ps1 run twilio:check
```

This fetches the Verify service from Twilio and checks its six-digit setting. It **does not send an OTP or SMS**, and does not need PostgreSQL running. It confirms credential/service access, **not** actual SMS delivery. Missing or malformed settings fail with field names only. Provider failures report a safe message and numeric error code, never credentials or raw provider errors.

For reference, `/health/integrations` remains configuration-only: it checks local setting shape and **does not** contact Twilio or send SMS. `configured: true` does not prove that the credentials work.

## 4. Activate the configuration

```powershell
# Starts dependencies if needed; recreates backend to load the changed .env.
docker compose up -d --build --force-recreate backend
docker compose up -d web
curl.exe http://localhost:3000/health/integrations
```

Look for `otp.provider: twilio` and `otp.configured: true`. Simply restarting the old container is not enough to replace environment values captured when it was created; recreate it as shown.

Changing Twilio credentials does **not** require rebuilding the Android app: they are backend-only. The app only needs the correct API URL. For the USB-local debug APK, keep Docker running and use:

```powershell
adb reverse tcp:3000 tcp:3000
```

## 5. Confirm a real SMS end to end

1. Open PhoneMail in the browser or Android app.
2. Enter a real Indian mobile number you control (`9876543210`, `919876543210`, or `+919876543210` forms are accepted).
3. Choose Continue once. This requests SMS from Twilio and may incur account charges.
4. Enter the six-digit code received on that phone. Do not look for production codes in Docker logs: PhoneMail never generates or logs them.
5. Successful verification creates/reuses the user, returns a JWT, and opens Inbox. Check `/auth/me` through the app to confirm the account.
6. Review the Twilio Console Verify logs if SMS does not arrive; share only a redacted error code, never keys or OTPs.

Default UI countdown: 10 minutes for Twilio, 5 minutes for development codes. The backend still enforces phone normalization, IP rate limits, ownership and JWT authentication. An expired/used/max-check-attempt challenge is rejected; provider outages are not misreported as successful verification. There are no automatic retries of billable send requests and no silent development fallback.

## Troubleshooting

| Symptom                                       | What to check                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Setup says missing/invalid credentials        | Check AC account, VA service and either the account Auth Token or both API key fields.                        |
| HTTP 401/403 or Twilio 20003 during preflight | Use live credentials for the correct account/subaccount; check key permissions.                               |
| Twilio 20404 during preflight                 | Verify Service SID and account/service ownership.                                                             |
| Six-digit check fails                         | Change the Verify service code length to 6 in the Console.                                                    |
| Trial destination rejected (e.g. 21608)       | Verify the destination in the trial account; check current trial limitations.                                 |
| Geographic restriction (e.g. 21408)           | Check **Verify** geographic permissions for India, not only Messaging settings.                               |
| Landline/unsupported number (e.g. 60205)      | Use a valid mobile number that receives SMS.                                                                  |
| Too many attempts / 429 / 60203               | Wait for provider/application limits; do not repeatedly request codes.                                        |
| Verification returns INVALID_OTP              | Code is wrong, expired, already consumed or max attempts were reached. Request a new code after the cooldown. |
| Network/provider error                        | Check outbound HTTPS access to Twilio and service status. Credentials are not exposed in the response.        |
| Email sending does not work                   | Twilio Verify handles sign-in, not SMTP/inbound mail. Configure those separately.                             |

Keep fraud protections enabled; do not disable them just to force a test to succeed. Check Twilio's account-specific India delivery/regulatory requirements before public rollout.

## Test status

There are 25 Twilio-specific automated tests using a mocked SDK. They cover both credential modes, incomplete credentials, E.164 forwarding, approved/non-approved checks, expiry, throttling, safe error handling, health with no network side effects, and user/JWT creation after approval. These tests never contact Twilio or send real SMS. Live service access and real SMS remain unverified until you add credentials and complete steps 3–5. The PowerShell setup helper is provided but has not been executed on Windows in this sandbox.

References: [Verify verifications](https://www.twilio.com/docs/verify/api/verification), [Verification checks and expiry](https://www.twilio.com/docs/verify/api/verification-check), [Verify services](https://www.twilio.com/docs/verify/api/service).
