import Head from "next/head";
import { FormEvent, useEffect, useState } from "react";
import styles from "./LoginVerificationGate.module.css";

type LoginVerificationGateProps = {
  destination?: string;
  channel?: "email" | "sms";
  smsAvailable?: boolean;
  maskedSms?: string;
  error?: string;
  busy?: boolean;
  starting?: boolean;
  resendAvailableAt?: number;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onSwitchChannel: (channel: "email" | "sms") => Promise<void>;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

export default function LoginVerificationGate({
  destination,
  channel = "email",
  smsAvailable = false,
  maskedSms,
  error,
  busy = false,
  starting = false,
  resendAvailableAt = 0,
  onVerify,
  onResend,
  onSwitchChannel,
  onRetry,
  onSignOut,
}: LoginVerificationGateProps) {
  const [code, setCode] = useState("");
  const [actionError, setActionError] = useState("");
  const [resending, setResending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError("");
    await onVerify(code);
  };

  const resend = async () => {
    setResending(true);
    setActionError("");
    try {
      await onResend();
    } catch (resendError) {
      setActionError(resendError instanceof Error ? resendError.message : "Could not resend the code.");
    } finally {
      setResending(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    setActionError("");
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const resendWait = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  return (
    <main className={styles.page}>
      <Head>
        <title>Verify sign-in | YourTube</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>
      <section className={styles.card} aria-labelledby="verify-heading">
        <p className={styles.eyebrow}>ACCOUNT SECURITY</p>
        <h1 id="verify-heading">Verify your sign-in</h1>
        {starting ? (
          <p className={styles.intro}>Checking this sign-in and preparing a verification code…</p>
        ) : destination ? (
          <>
            <p className={styles.intro}>
              Enter the six-digit code sent by {channel === "sms" ? "text message" : "email"} to{" "}
              <strong>{destination}</strong>. The code expires in 10 minutes.
            </p>
            <form onSubmit={submitCode} className={styles.form}>
              <label htmlFor="login-code">{channel === "sms" ? "SMS verification code" : "Email verification code"}</label>
              <input
                id="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                aria-describedby="verify-error"
              />
              {(error || actionError) && <p id="verify-error" className={styles.error} role="alert">{error || actionError}</p>}
              <button className={styles.primaryButton} type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Verifying…" : "Verify and continue"}
              </button>
            </form>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void resend()}
              disabled={resending || resendWait > 0}
            >
              {resending ? "Sending…" : resendWait > 0 ? `Resend code in ${resendWait}s` : "Resend code"}
            </button>
            {smsAvailable && (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void onSwitchChannel(channel === "sms" ? "email" : "sms")}
                disabled={busy}
              >
                {channel === "sms"
                  ? "Use email instead"
                  : `Send a code by SMS${maskedSms ? ` to ${maskedSms}` : ""}`}
              </button>
            )}
          </>
        ) : (
          <>
            <p className={styles.intro}>
              Sign-in verification could not be started. Check that email delivery and application session settings are configured.
            </p>
            {(error || actionError) && <p className={styles.error} role="alert">{error || actionError}</p>}
            <button className={styles.primaryButton} type="button" onClick={() => void retry()} disabled={retrying || busy}>
              {retrying ? "Retrying…" : "Try again"}
            </button>
            {smsAvailable && (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void onSwitchChannel("sms")}
                disabled={busy}
              >
                {`Send a code by SMS${maskedSms ? ` to ${maskedSms}` : ""}`}
              </button>
            )}
          </>
        )}
        <button className={styles.textButton} type="button" onClick={() => void onSignOut()}>
          Sign out
        </button>
      </section>
    </main>
  );
}
