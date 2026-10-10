import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import styles from "./room.module.css";

type JitsiParticipant = {
  participantId: string;
  displayName?: string;
};

type JitsiApi = {
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
  addEventListener: (event: string, callback: (payload: any) => void) => void;
  removeEventListener: (event: string, callback: (payload: any) => void) => void;
};

type JitsiOptions = {
  roomName: string;
  parentNode: HTMLElement;
  width: string;
  height: string;
  userInfo: { displayName: string };
  configOverwrite: Record<string, unknown>;
  interfaceConfigOverwrite: Record<string, unknown>;
  jwt: string;
};

type MeetingAuthorization = {
  token: string;
  domain: string;
  roomName: string;
  isHost: boolean;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: JitsiOptions) => JitsiApi;
  }
}

export default function MeetingRoomPage() {
  const router = useRouter();
  const { user } = useUser();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [participants, setParticipants] = useState<JitsiParticipant[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [status, setStatus] = useState("Connecting to the meeting service…");
  const [meetingError, setMeetingError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [canModerate, setCanModerate] = useState(false);
  const [lobbyLocked, setLobbyLocked] = useState(false);
  const room = typeof router.query.room === "string" ? router.query.room : "";
  const roomIsValid = /^[a-f\d]{40}$/i.test(room);

  useEffect(() => {
    if (!user || !roomIsValid || !containerRef.current) return;
    let isMounted = true;
    let script = document.querySelector<HTMLScriptElement>('script[data-yourtube-jitsi="true"]');
    let loadListener: (() => void) | undefined;
    let errorListener: (() => void) | undefined;
    let disposeMeeting: (() => void) | undefined;

    const setupMeeting = (authorization: MeetingAuthorization) => {
      if (!isMounted || !containerRef.current || !window.JitsiMeetExternalAPI) return;
      try {
        const api = new window.JitsiMeetExternalAPI(authorization.domain, {
          roomName: authorization.roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName: user.channelname || user.name || "YourTube member" },
          jwt: authorization.token,
          configOverwrite: {
            prejoinConfig: { enabled: true },
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            enableWelcomePage: false,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            TOOLBAR_BUTTONS: [
              "microphone",
              "camera",
              "closedcaptions",
              "desktop",
              "chat",
              "raisehand",
              "participants-pane",
              "tileview",
              "settings",
              "hangup",
            ],
          },
        });
        apiRef.current = api;
        const joined = (payload: JitsiParticipant) => {
          setParticipants((current) =>
            current.some((person) => person.participantId === payload.participantId)
              ? current.map((person) => person.participantId === payload.participantId ? payload : person)
              : [...current, payload]
          );
        };
        const left = (payload: { participantId: string }) => {
          setParticipants((current) => current.filter((person) => person.participantId !== payload.participantId));
        };
        const ready = () => {
          setStatus("Connected");
          setCallStartedAt((startedAt) => startedAt || Date.now());
          setCanModerate(authorization.isHost);
        };
        const failed = () => setStatus("Connection failed. Check camera/microphone permissions and try again.");
        const closed = () => {
          setStatus("You left the meeting.");
          setParticipants([]);
        };
        api.addEventListener("participantJoined", joined);
        api.addEventListener("participantLeft", left);
        api.addEventListener("videoConferenceJoined", ready);
        api.addEventListener("readyToClose", closed);
        api.addEventListener("cameraError", failed);
        api.addEventListener("micError", failed);
        setStatus("Waiting for the meeting to connect…");
        return () => {
          api.removeEventListener("participantJoined", joined);
          api.removeEventListener("participantLeft", left);
          api.removeEventListener("videoConferenceJoined", ready);
          api.removeEventListener("readyToClose", closed);
          api.removeEventListener("cameraError", failed);
          api.removeEventListener("micError", failed);
          api.dispose();
          apiRef.current = null;
        };
      } catch (error) {
        console.error("Unable to initialize video meeting:", error);
        setStatus("The meeting could not be started. Check the configured meeting service.");
      }
    };

    const loadAuthorizedMeeting = async () => {
      try {
        setStatus("Authenticating with the meeting service…");
        const response = await axiosInstance.get<MeetingAuthorization>(`/meeting/${room}/token`);
        if (!isMounted) return;
        setCanModerate(response.data.isHost);
        const startMeeting = () => {
          if (isMounted) disposeMeeting = setupMeeting(response.data);
        };
        if (window.JitsiMeetExternalAPI) {
          startMeeting();
          return;
        }
        if (!script) {
          script = document.createElement("script");
          script.src = `https://${response.data.domain}/external_api.js`;
          script.async = true;
          script.dataset.yourtubeJitsi = "true";
          loadListener = () => {
            if (script) script.dataset.yourtubeJitsiLoaded = "true";
            startMeeting();
          };
          errorListener = () => setStatus("Unable to load the authenticated meeting service.");
          script.addEventListener("load", loadListener, { once: true });
          script.addEventListener("error", errorListener, { once: true });
          document.head.appendChild(script);
          return;
        }
        if (script.dataset.yourtubeJitsiLoaded === "true") {
          setStatus("The meeting service did not initialize. Refresh and try again.");
          return;
        }
        loadListener = () => startMeeting();
        errorListener = () => setStatus("Unable to load the authenticated meeting service.");
        script.addEventListener("load", loadListener, { once: true });
        script.addEventListener("error", errorListener, { once: true });
      } catch (error: any) {
        const statusCode = error.response?.status;
        if (statusCode === 400) {
          setMeetingError("This meeting ID is invalid. Check it and try again.");
          setStatus("");
          return;
        }
        if (statusCode === 404) {
          setMeetingError("Meeting not found or expired. Check the ID or ask the host for a new invite.");
          setStatus("");
          return;
        }
        console.error("Unable to authorize meeting:", error);
        setMeetingError(error.response?.data?.message || "You are not authorized to join this meeting.");
        setStatus("");
      }
    };

    void loadAuthorizedMeeting();

    return () => {
      isMounted = false;
      if (script && loadListener) script.removeEventListener("load", loadListener);
      if (script && errorListener) script.removeEventListener("error", errorListener);
      disposeMeeting?.();
    };
  }, [room, roomIsValid, user]);

  useEffect(() => {
    if (callStartedAt === null) return;
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - callStartedAt) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [callStartedAt]);

  const leaveMeeting = () => {
    apiRef.current?.executeCommand("hangup");
    apiRef.current?.dispose();
    apiRef.current = null;
    void router.push("/meetings");
  };

  const toggleMeetingLobby = () => {
    const nextLockedState = !lobbyLocked;
    apiRef.current?.executeCommand("toggleLobby", nextLockedState);
    setLobbyLocked(nextLockedState);
  };

  const shareInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyStatus("Meeting link copied.");
    } catch (error) {
      console.error("Unable to copy meeting link:", error);
      setCopyStatus("Copy failed. Copy the URL from your browser address bar.");
    }
  };

  const formattedDuration = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, "0")}:${String(
    Math.floor((elapsedSeconds % 3600) / 60)
  ).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  if (!roomIsValid) {
    return (
      <main className={styles.page}>
        <p className={styles.error} role="alert">
          This meeting ID is invalid. Enter a valid 40-character YourTube meeting ID or invite link.
        </p>
        <button className={styles.action} type="button" onClick={() => void router.push("/meetings")}>Back to meetings</button>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <p className={styles.notice}>Sign in to join this meeting.</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Head><title>Video meeting | YourTube</title></Head>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>YOURTUBE MEETING</p>
          <h1>Room {room.slice(0, 8)}…</h1>
          {status && <p className={styles.status} role="status">{status}</p>}
        </div>
        <div className={styles.meetingMeta}>
          <span>{participants.length + 1} participant{participants.length === 0 ? "" : "s"}</span>
          <span>Duration {formattedDuration}</span>
          <button type="button" onClick={shareInvite}>Copy invite link</button>
        </div>
      </header>
      {meetingError && <p className={styles.error} role="alert">{meetingError}</p>}
      {copyStatus && <p className={styles.copyStatus} role="status">{copyStatus}</p>}
      <section className={styles.call} aria-label="Video meeting">
        <div className={styles.embed} ref={containerRef} />
      </section>
      {participants.length > 0 && (
        <p className={styles.participants}>
          In the meeting: {participants.map((participant) => participant.displayName || "Participant").join(", ")}
        </p>
      )}
      {canModerate && (
        <section className={styles.hostControls} aria-label="Host meeting controls">
          <h2>Host controls</h2>
          <div className={styles.hostActions}>
            <button type="button" onClick={() => apiRef.current?.executeCommand("muteEveryone", "audio")}>
              Mute everyone
            </button>
            <button type="button" onClick={toggleMeetingLobby}>
              {lobbyLocked ? "Unlock meeting lobby" : "Lock meeting lobby"}
            </button>
          </div>
          {participants.length > 0 && (
            <ul className={styles.hostParticipants}>
              {participants.map((participant) => (
                <li key={participant.participantId}>
                  <span>{participant.displayName || "Participant"}</span>
                  <button type="button" onClick={() => apiRef.current?.executeCommand("muteRemoteParticipant", participant.participantId)}>
                    Mute
                  </button>
                  <button type="button" onClick={() => apiRef.current?.executeCommand("grantModerator", participant.participantId)}>
                    Make co-host
                  </button>
                  <button type="button" onClick={() => apiRef.current?.executeCommand("kickParticipant", participant.participantId)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <p className={styles.disclaimer}>
        Calls are provided by JaaS. Sign-in is required, meeting access uses a short-lived token, and the room owner has moderation controls.
      </p>
      <button className={styles.leave} type="button" onClick={leaveMeeting}>Leave meeting</button>
    </main>
  );
}
