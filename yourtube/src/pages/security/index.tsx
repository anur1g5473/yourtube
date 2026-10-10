import Head from "next/head";
import { FormEvent, useCallback, useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import styles from "./security.module.css";

type SecurityEvent = {
  _id: string;
  eventType: string;
  status: string;
  ipAddress?: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  country?: string;
  city?: string;
  state?: string;
  locationStatus?: "resolved" | "not_found" | "unconfigured" | "lookup_failed";
  createdAt: string;
};

type TrustedDevice = {
  _id: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  lastIp?: string;
  lastCity?: string;
  lastState?: string;
  lastCountry?: string;
  locationStatus?: "resolved" | "not_found" | "unconfigured" | "lookup_failed";
  lastUsedAt: string;
  trustedUntil: string;
  current: boolean;
};

type PhoneSettings = {
  verified: boolean;
  phoneNumber: string | null;
  pendingPhoneNumber: string | null;
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object" || !("response" in error)) return fallback;
  const { response } = error;
  if (!response || typeof response !== "object" || !("data" in response)) return fallback;
  const { data } = response;
  if (!data || typeof data !== "object" || !("message" in data)) return fallback;
  return typeof data.message === "string" ? data.message : fallback;
};

export default function SecurityPage() {
  const { user, handlegooglesignin, logout } = useUser();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);
  const [phoneSettings, setPhoneSettings] = useState<PhoneSettings | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneNotice, setPhoneNotice] = useState("");

  const loadEvents = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setEvents([]);
      return;
    }
    try {
      const [eventResponse, deviceResponse, phoneResponse] = await Promise.all([
        axiosInstance.get<SecurityEvent[]>("/security/mine"),
        axiosInstance.get<TrustedDevice[]>("/security/devices"),
        axiosInstance.get<PhoneSettings>("/security/phone"),
      ]);
      setEvents(eventResponse.data);
      setDevices(deviceResponse.data);
      setPhoneSettings(phoneResponse.data);
      setErrorMessage("");
    } catch (error) {
      console.error("Unable to load security history:", error);
      setErrorMessage("Security history could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const revokeDevice = async (deviceId: string) => {
    setRevokingDeviceId(deviceId);
    setErrorMessage("");
    try {
      const response = await axiosInstance.delete(`/security/devices/${deviceId}`);
      setDevices((existing) => existing.filter((device) => device._id !== deviceId));
      if (response.data.currentDevice) await logout(false);
    } catch (error) {
      console.error("Unable to revoke trusted device:", error);
      setErrorMessage("This device could not be revoked. Please try again.");
    } finally {
      setRevokingDeviceId(null);
    }
  };

  const sendPhoneCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPhoneBusy(true);
    setPhoneError("");
    setPhoneNotice("");
    try {
      const response = await axiosInstance.post("/security/phone/verification", { phoneNumber: phoneInput });
      setPhoneSettings((current) => ({
        verified: current?.verified || false,
        phoneNumber: current?.phoneNumber || null,
        pendingPhoneNumber: response.data.pendingPhoneNumber,
      }));
      setPhoneCode("");
      setPhoneNotice(response.data.message);
    } catch (error) {
      console.error("Unable to send mobile verification code:", error);
      setPhoneError(getApiErrorMessage(error, "Could not send a mobile verification code."));
    } finally {
      setPhoneBusy(false);
    }
  };

  const verifyPhoneCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPhoneBusy(true);
    setPhoneError("");
    setPhoneNotice("");
    try {
      const response = await axiosInstance.post("/security/phone/verify", { code: phoneCode });
      setPhoneSettings({
        verified: true,
        phoneNumber: response.data.phoneNumber,
        pendingPhoneNumber: null,
      });
      setPhoneInput("");
      setPhoneCode("");
      setPhoneNotice(response.data.message);
    } catch (error) {
      console.error("Unable to verify mobile number:", error);
      setPhoneError(getApiErrorMessage(error, "Could not verify this mobile number."));
    } finally {
      setPhoneBusy(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <main className={styles.page}>
      <Head>
        <title>Account security | YourTube</title>
        <meta name="description" content="Review recent sign-in activity for your YourTube account." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className={styles.container}>
        <header>
          <p className={styles.eyebrow}>ACCOUNT</p>
          <h1>Security activity</h1>
          <p className={styles.intro}>
            Review sign-in attempts and remove browsers you no longer trust. New browsers and changed network addresses require an email code.
          </p>
        </header>

        {!user ? (
          <section className={styles.empty}>
            <p>Sign in to review your account activity.</p>
            <button type="button" onClick={handlegooglesignin}>Sign in with Google</button>
          </section>
        ) : loading ? (
          <p className={styles.empty}>Loading sign-in activity…</p>
        ) : errorMessage ? (
          <p className={styles.error} role="alert">{errorMessage}</p>
        ) : (
          <>
            <section className={styles.phoneSection} aria-labelledby="phone-security-heading">
              <h2 id="phone-security-heading">SMS sign-in verification</h2>
              <p>
                {phoneSettings?.verified
                  ? `Verified mobile number: ${phoneSettings.phoneNumber}.`
                  : "Add and verify a mobile number to use SMS as an alternate sign-in verification method."}
              </p>
              <form onSubmit={sendPhoneCode} className={styles.phoneForm}>
                <label htmlFor="security-phone">Mobile number (international format)</label>
                <div className={styles.phoneFormRow}>
                  <input
                    id="security-phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+14155552671"
                    pattern="\+[1-9][0-9]{7,14}"
                    value={phoneInput}
                    onChange={(event) => setPhoneInput(event.target.value)}
                    required
                  />
                  <button type="submit" disabled={phoneBusy}>
                    {phoneBusy ? "Sending…" : phoneSettings?.verified ? "Verify new number" : "Send code"}
                  </button>
                </div>
              </form>
              {phoneSettings?.pendingPhoneNumber && (
                <form onSubmit={verifyPhoneCode} className={styles.phoneForm}>
                  <p>A verification code was sent to {phoneSettings.pendingPhoneNumber}.</p>
                  <label htmlFor="security-phone-code">Six-digit SMS code</label>
                  <div className={styles.phoneFormRow}>
                    <input
                      id="security-phone-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={phoneCode}
                      onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                    />
                    <button type="submit" disabled={phoneBusy || phoneCode.length !== 6}>
                      {phoneBusy ? "Verifying…" : "Verify number"}
                    </button>
                  </div>
                </form>
              )}
              {phoneError && <p className={styles.error} role="alert">{phoneError}</p>}
              {phoneNotice && <p className={styles.phoneNotice} role="status">{phoneNotice}</p>}
            </section>
            <section className={styles.deviceList} aria-label="Trusted devices">
              <h2>Trusted browsers</h2>
              {devices.length === 0 ? <p className={styles.empty}>No trusted devices yet.</p> : devices.map((device) => (
                <article className={styles.device} key={device._id}>
                  <div>
                    <h3>
                      {device.browser || "Unknown browser"} · {device.deviceType || "Unknown device"}
                      {device.current ? " (this browser)" : ""}
                    </h3>
                    <p>{device.os || "Unknown platform"} · Last used {new Date(device.lastUsedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                    <p>Approximate location: {[device.lastCity, device.lastState, device.lastCountry].filter(Boolean).join(", ") || "Unavailable"}</p>
                    <p>Trusted until {new Date(device.trustedUntil).toLocaleDateString("en-IN")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revokeDevice(device._id)}
                    disabled={revokingDeviceId === device._id}
                  >
                    {revokingDeviceId === device._id ? "Revoking…" : "Revoke"}
                  </button>
                </article>
              ))}
            </section>
            <section className={styles.eventList} aria-label="Recent sign-in events">
              <h2>Recent activity</h2>
              {events.length === 0 ? <p className={styles.empty}>No sign-in events have been recorded yet.</p> : events.map((event) => (
                <article className={styles.event} key={event._id}>
                  <div>
                    <h2>{event.eventType === "login" ? "Sign-in" : event.eventType.replace(/_/g, " ")}</h2>
                    <p>{new Date(event.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                  <dl>
                    <div><dt>Device</dt><dd>{event.deviceType || "Unknown"}</dd></div>
                    <div><dt>Browser</dt><dd>{event.browser || "Unknown"}</dd></div>
                    <div><dt>Platform</dt><dd>{event.os || "Unknown"}</dd></div>
                    <div><dt>IP address</dt><dd>{event.ipAddress || "Unavailable"}</dd></div>
                    <div>
                      <dt>Approximate location</dt>
                      <dd>
                        {[event.city, event.state, event.country].filter(Boolean).join(", ") ||
                          (event.locationStatus === "lookup_failed"
                            ? "Local GeoIP database unavailable"
                            : event.locationStatus === "not_found"
                              ? "No location for this IP"
                              : event.locationStatus === "unconfigured"
                                ? "Not configured"
                                : "Unavailable")}
                      </dd>
                    </div>
                    <div><dt>Result</dt><dd>{event.status}</dd></div>
                  </dl>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
