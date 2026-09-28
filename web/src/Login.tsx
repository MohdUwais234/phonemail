import { useState, useEffect, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  Smartphone,
  Mail,
  LockKeyhole,
  ArrowUpRight,
} from "lucide-react";
import { api } from "./api";
import { useAuth } from "./auth";
import { Logo, Button, ErrorState } from "./components";
export function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState(""),
    [step, setStep] = useState<"phone" | "otp">("phone"),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [cooldown, setCooldown] = useState(0),
    [expires, setExpires] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setCooldown((v) => Math.max(0, v - 1));
      setExpires((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  async function requestOtp() {
    setBusy(true);
    setError("");
    try {
      const r = await api.requestOtp(phone);
      setCooldown(r.retryAfter);
      setExpires(r.expiresIn);
      setStep("otp");
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step === "phone") {
      await requestOtp();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api.verifyOtp(phone, code);
      await login(r.token, r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <header className="login-header">
        <Logo />
        <span className="header-note">
          <span className="status-dot" />A simpler way to stay connected
        </span>
        <span className="login-header-right">MADE FOR YOUR EVERYDAY</span>
      </header>
      <main className="login-main">
        <section className="login-story">
          <div className="pill">
            <span /> LESS SETUP. MORE CONNECTION.
          </div>
          <h1>
            Your number.
            <br />
            Your inbox.
            <br />
            <span>Simply yours.</span>
          </h1>
          <p>
            Email, without the extra username.
            <br />
            One phone number is all you need to connect
            <br className="desktop-only" /> with the people who matter.
          </p>
          <div className="identity-preview">
            <div className="preview-label">
              <span className="tiny-dot" /> ONE NUMBER, A NEW POSSIBILITY
            </div>
            <div className="identity-row">
              <div className="identity-icon">
                <Smartphone size={24} />
              </div>
              <div>
                <small>Your phone number</small>
                <strong>+91 98765 43210</strong>
              </div>
              <ArrowRight className="identity-arrow" size={19} />
            </div>
            <div className="identity-divider">
              <span />
              <span />
              <span />
            </div>
            <div className="identity-row">
              <div className="identity-icon mail">
                <Mail size={24} />
              </div>
              <div>
                <small>Your PhoneMail address</small>
                <strong>
                  9876543210<span>@phonemail.com</span>
                </strong>
              </div>
              <span className="check-icon">
                <Check size={14} />
              </span>
            </div>
          </div>
          <div className="story-foot">
            <span className="mini-shield">
              <ShieldCheck size={18} />
            </span>
            <span>One less password. One more connection.</span>
          </div>
        </section>
        <section className="login-card" aria-label="Sign in">
          <div className="card-icon">
            {step === "phone" ? (
              <Smartphone size={26} />
            ) : (
              <LockKeyhole size={25} />
            )}
          </div>
          <span className="eyebrow">
            {step === "phone"
              ? "YOUR INBOX STARTS HERE"
              : "A QUICK SECURITY CHECK"}
          </span>
          <h2>{step === "phone" ? "Hello, you." : "Check your messages."}</h2>
          <p className="card-subtitle">
            {step === "phone"
              ? "A familiar number. A fresh way to email."
              : `We sent a 6-digit code to ${phone}.`}
          </p>
          <form onSubmit={submit}>
            {step === "phone" ? (
              <>
                <label htmlFor="phone">Enter your phone number</label>
                <div className="phone-input">
                  <span className="country">
                    <span
                      className="india-flag"
                      role="img"
                      aria-label="India"
                    />{" "}
                    +91
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel-national"
                    inputMode="tel"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    maxLength={25}
                    aria-describedby="phone-help"
                  />
                </div>
                <p className="input-help" id="phone-help">
                  We’ll text you a code. No password needed.
                </p>
              </>
            ) : (
              <>
                <label htmlFor="otp">Verification code</label>
                <input
                  className="otp-input"
                  id="otp"
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
                <p className="input-help">
                  {expires > 0
                    ? `Code expires in ${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, "0")}`
                    : "Your code has expired. Request a new one below."}
                </p>
              </>
            )}
            {error && <ErrorState message={error} />}
            <Button
              className="primary full"
              busy={busy}
              disabled={step === "otp" && (code.length !== 6 || expires === 0)}
              type="submit"
            >
              {step === "phone" ? "Continue with phone" : "Verify & open inbox"}
              <ArrowRight size={18} />
            </Button>
            {step === "otp" && (
              <div className="otp-actions">
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setError("");
                  }}
                  disabled={busy}
                >
                  <ArrowLeft size={14} />
                  Change number
                </button>
                <button
                  type="button"
                  onClick={() => void requestOtp()}
                  disabled={busy || cooldown > 0}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </div>
            )}
          </form>
          <div className="safe-note">
            <ShieldCheck size={17} />
            <span>Your number stays yours. Always.</span>
          </div>
          <div className="card-divider" />
          <div className="login-benefit">
            <span className="benefit-check">
              <Check size={13} />
            </span>
            <span>Your email address, created automatically</span>
          </div>
          <div className="login-benefit">
            <span className="benefit-check">
              <Check size={13} />
            </span>
            <span>One inbox for all your conversations</span>
          </div>
          <div className="login-benefit">
            <span className="benefit-check">
              <Check size={13} />
            </span>
            <span>Sign in securely with a one-time code</span>
          </div>
          <p className="account-note">
            New here? Your account is created when you verify.
          </p>
        </section>
      </main>
      <footer className="login-footer">
        <span>© {new Date().getFullYear()} PhoneMail</span>
        <span>
          Thoughtfully simple. Naturally connected.
          <ArrowUpRight size={14} />
        </span>
        <span>
          <LockKeyhole size={13} /> Secure phone verification
        </span>
      </footer>
    </div>
  );
}
