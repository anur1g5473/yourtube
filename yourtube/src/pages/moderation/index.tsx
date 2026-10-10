import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import styles from "./moderation.module.css";

type Report = {
  _id: string;
  videoid: string;
  userid: string;
  usercommented: string;
  commentbody: string;
  commentedon: string;
  reports: { reason: string; reportedAt: string }[];
};

export default function ModerationPage() {
  const { user } = useUser();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadReports = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const response = await axiosInstance.get<Report[]>("/comment/moderation/reports");
      setReports(response.data);
      setErrorMessage("");
    } catch (error: any) {
      console.error("Unable to load moderation queue:", error);
      setErrorMessage(
        error.response?.data?.message || "The moderation queue could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const moderate = async (id: string, action: "approve" | "remove") => {
    try {
      await axiosInstance.patch(`/comment/moderation/${id}`, { action });
      setReports((current) => current.filter((report) => report._id !== id));
    } catch (error: any) {
      console.error("Unable to moderate comment:", error);
      setErrorMessage(error.response?.data?.message || "The moderation decision could not be saved.");
    }
  };

  return (
    <main className={styles.page}>
      <Head><title>Comment moderation | YourTube</title></Head>
      <div className={styles.container}>
        <p className={styles.eyebrow}>COMMUNITY</p>
        <h1>Comment reports</h1>
        <p className={styles.intro}>Reported comments are held here for review; reports do not automatically remove content.</p>

        {errorMessage && (
          <p role="alert" className={styles.message}>{errorMessage}</p>
        )}
        {loading ? (
          <p className={styles.message}>Loading reports…</p>
        ) : !errorMessage && reports.length === 0 ? (
          <p className={styles.message}>No comments are awaiting review.</p>
        ) : (
          <div className={styles.reportList}>
            {reports.map((report) => (
              <article className={styles.report} key={report._id}>
                <p className={styles.author}>{report.usercommented} · {new Date(report.commentedon).toLocaleString()}</p>
                <p className={styles.comment}>{report.commentbody}</p>
                <p className={styles.reasons}>
                  Reports: {report.reports.map((item) => item.reason).join(", ")}
                </p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    onClick={() => void moderate(report._id, "approve")}
                    className={styles.approve}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void moderate(report._id, "remove")}
                    className={styles.remove}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
