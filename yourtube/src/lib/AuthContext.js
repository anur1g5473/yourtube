import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { provider, auth } from "./firebase";
import axiosInstance, { APP_SESSION_STORAGE_KEY, DEVICE_ID_STORAGE_KEY } from "./axiosinstance";
import LoginVerificationGate from "@/components/LoginVerificationGate";

const UserContext = createContext();

const getBrowserDeviceId = () => {
  let deviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!deviceId) {
    deviceId = window.crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }
  return deviceId;
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loginVerification, setLoginVerification] = useState(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const processingUid = useRef(null);
  const verifiedUid = useRef(null);

  const login = (userdata) => {
    setUser(userdata);
    localStorage.setItem("user", JSON.stringify(userdata));
  };

  const logout = async (revokeServerSession = true) => {
    try {
      if (revokeServerSession && sessionStorage.getItem(APP_SESSION_STORAGE_KEY)) {
        await axiosInstance.post("/security/logout");
      }
    } catch (error) {
      console.error("Unable to revoke server sign-in session:", error);
    }
    setUser(null);
    setLoginVerification(null);
    setVerificationError("");
    processingUid.current = null;
    verifiedUid.current = null;
    sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
    localStorage.removeItem("user");
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };

  const startLoginVerification = useCallback(async (firebaseUser, retry = false) => {
    if (!firebaseUser || verifiedUid.current === firebaseUser.uid) return;
    if (!retry && processingUid.current === firebaseUser.uid) return;
    processingUid.current = firebaseUser.uid;
    setUser(null);
    setVerificationBusy(true);
    setVerificationError("");
    setLoginVerification({ firebaseUser, starting: true });
    sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);

    let deviceId;
    let profile;
    try {
      deviceId = getBrowserDeviceId();
      const account = await axiosInstance.post("/user/login", {
        email: firebaseUser.email,
        name: firebaseUser.displayName,
        image: firebaseUser.photoURL,
      });
      profile = account.data.result;
      setLoginVerification({ firebaseUser, deviceId, profile, starting: true });
      const response = await axiosInstance.post("/security/challenge", { deviceId });
      if (response.data.trusted) {
        sessionStorage.setItem(APP_SESSION_STORAGE_KEY, response.data.sessionToken);
        verifiedUid.current = firebaseUser.uid;
        login(profile);
        setLoginVerification(null);
        return;
      }

      setLoginVerification({
        firebaseUser,
        deviceId,
        profile,
        challengeId: response.data.challengeId,
        channel: response.data.channel,
        destination: response.data.destination,
        smsAvailable: response.data.smsAvailable,
        maskedSms: response.data.maskedSms,
      });
    } catch (error) {
      console.error("Unable to start sign-in verification:", error);
      setLoginVerification({
        firebaseUser,
        deviceId,
        profile,
        smsAvailable: error.response?.data?.smsAvailable,
        maskedSms: error.response?.data?.maskedSms,
      });
      setVerificationError(
        error.response?.data?.message || "Sign-in verification could not be started. Please retry."
      );
    } finally {
      processingUid.current = null;
      setVerificationBusy(false);
    }
  }, []);

  const verifyLoginCode = async (code) => {
    if (!loginVerification?.challengeId) return;
    setVerificationBusy(true);
    setVerificationError("");
    try {
      const response = await axiosInstance.post("/security/verify", {
        challengeId: loginVerification.challengeId,
        deviceId: loginVerification.deviceId,
        code,
      });
      sessionStorage.setItem(APP_SESSION_STORAGE_KEY, response.data.sessionToken);
      verifiedUid.current = loginVerification.firebaseUser.uid;
      login(loginVerification.profile);
      setLoginVerification(null);
    } catch (error) {
      console.error("Unable to verify sign-in code:", error);
      setVerificationError(error.response?.data?.message || "The verification code could not be checked.");
    } finally {
      setVerificationBusy(false);
    }
  };

  const resendLoginCode = async () => {
    if (!loginVerification?.challengeId) return;
    setVerificationError("");
    try {
      await axiosInstance.post("/security/resend", { challengeId: loginVerification.challengeId });
      setLoginVerification((current) => current ? {
        ...current,
        resendAvailableAt: Date.now() + 60_000,
      } : current);
    } catch (error) {
      const message = error.response?.data?.message || "The verification code could not be resent.";
      setVerificationError(message);
      throw new Error(message);
    }
  };

  const switchLoginVerificationChannel = async (channel) => {
    if (!loginVerification?.deviceId) return;
    setVerificationBusy(true);
    setVerificationError("");
    try {
      const response = await axiosInstance.post("/security/challenge", {
        deviceId: loginVerification.deviceId,
        channel,
        forceChallenge: true,
      });
      if (response.data.trusted) {
        sessionStorage.setItem(APP_SESSION_STORAGE_KEY, response.data.sessionToken);
        verifiedUid.current = loginVerification.firebaseUser.uid;
        login(loginVerification.profile);
        setLoginVerification(null);
        return;
      }
      setLoginVerification((current) => current ? {
        ...current,
        challengeId: response.data.challengeId,
        channel: response.data.channel,
        destination: response.data.destination,
        smsAvailable: response.data.smsAvailable,
        maskedSms: response.data.maskedSms,
        resendAvailableAt: Date.now() + 60_000,
      } : current);
    } catch (error) {
      console.error("Unable to switch sign-in verification channel:", error);
      setVerificationError(error.response?.data?.message || "The verification method could not be changed.");
    } finally {
      setVerificationBusy(false);
    }
  };

  const retrySignInVerification = async () => {
    const firebaseUser = loginVerification?.firebaseUser || auth.currentUser;
    if (!firebaseUser) {
      setVerificationError("Your sign-in expired. Sign in again to continue.");
      return;
    }
    setLoginVerification(null);
    await startLoginVerification(firebaseUser, true);
  };

  const handlegooglesignin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoginVerification(null);
        setVerificationError("");
        processingUid.current = null;
        verifiedUid.current = null;
        sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
        return;
      }
      if (verifiedUid.current !== firebaseUser.uid) {
        void startLoginVerification(firebaseUser);
      }
    });
    return () => unsubscribe();
  }, [startLoginVerification]);

  return (
    <UserContext.Provider
      value={{
        user,
        login,
        logout,
        handlegooglesignin,
        loginVerification,
        verifyLoginCode,
        resendLoginCode,
        switchLoginVerificationChannel,
        retrySignInVerification,
        verificationBusy,
        verificationError,
      }}
    >
      {loginVerification ? (
        <LoginVerificationGate
          destination={loginVerification.destination}
          channel={loginVerification.channel}
          smsAvailable={Boolean(loginVerification.smsAvailable)}
          maskedSms={loginVerification.maskedSms}
          error={verificationError}
          busy={verificationBusy}
          starting={Boolean(loginVerification.starting)}
          resendAvailableAt={loginVerification.resendAvailableAt}
          onVerify={verifyLoginCode}
          onResend={resendLoginCode}
          onSwitchChannel={switchLoginVerificationChannel}
          onRetry={retrySignInVerification}
          onSignOut={logout}
        />
      ) : children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
