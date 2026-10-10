import Head from "next/head";
import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import styles from "./meetings.module.css";

export default function MeetingsPage() {
  const router = useRouter();
  const { user, handlegooglesignin } = useUser();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  const openRoom = (code: string) => {
    if (!user) {
      setError("Sign in before creating or joining a meeting.");
      return;
    }
    const safeCode = code.trim().replace(/[^a-zA-Z0-9-]/g, "");
    if (safeCode.length < 12 || safeCode.length > 80) {
      setError("Meeting IDs must be between 12 and 80 letters, numbers, or hyphens.");
      return;
    }
    void router.push(`/meetings/${encodeURIComponent(safeCode)}`);
  }

  const createMeeting = async () => {
    if (!user || creatingMeeting) return;
    setCreatingMeeting(true);
    setError("");
    try {
      const response = await axiosInstance.post<{ roomId: string }>("/meeting");
      await router.push(`/meetings/${encodeURIComponent(response.data.roomId)}`);
    } catch (requestError: any) {
      console.error("Unable to create a JaaS meeting:", requestError);
      setError(requestError.response?.data?.message || "The meeting could not be created.");
    } finally {
      setCreatingMeeting(false);
    }
  };

  const joinMeeting = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openRoom(roomCode);
  };

  return (
    <main className={styles.page}>
      <Head>
        <title>Meetings | YourTube</title>
        <meta name="description" content="Create or join a secure YourTube video meeting." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div className={styles.container}>
        <p className={styles.eyebrow}>YOURTUBE MEETINGS</p>
        <h1>Meet face to face.</h1>
        <p className={styles.intro}>Start a group call or join a private meeting using its room ID.</p>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.cards}>
          <section className={styles.card}>
            <h2>Create a meeting</h2>
            <p>Create a signed JaaS room; its owner receives moderator controls.</p>
            <button type="button" onClick={() => void createMeeting()} disabled={!user || creatingMeeting}>
              {creatingMeeting ? "Creating…" : "Create meeting"}
            </button>
          </section>
          <section className={styles.card}>
            <h2>Join a meeting</h2>
            <p>Enter the room ID from a YourTube meeting invitation.</p>
            <form onSubmit={joinMeeting}>
              <label htmlFor="room-code">Meeting ID</label>
              <input
                id="room-code"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                placeholder="Paste meeting ID"
                autoComplete="off"
                required
              />
              <button type="submit" disabled={!user || !roomCode.trim()}>Join meeting</button>
            </form>
          </section>
        </div>

        {!user && (
          <p className={styles.signIn}>
            <button type="button" onClick={handlegooglesignin}>Sign in with Google</button> to create or join.
          </p>
        )}
        <p className={styles.note}>
          Meetings require a signed-in YourTube account and a short-lived JaaS token. Share invitations only with intended attendees.
        </p>
      </div>
    </main>
  );
};
