import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import styles from "./downloads.module.css";

type DownloadRecord = {
  _id: string;
  videoId: string;
  videoTitle: string;
  fileSize: string;
  status: "pending" | "completed" | "failed";
  plan: string;
  downloadedAt: string;
};

type DownloadResponse = {
  downloads: DownloadRecord[];
  quota: {
    plan: string;
    limit: number | null;
    period: "day" | "month";
    used: number;
    remaining: number | null;
  };
};

const formatDate = (date: string) =>
  new Date(date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function DownloadsPage() {
  const { user, handlegooglesignin } = useUser();
  const [data, setData] = useState<DownloadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDownloads = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setData(null);
      return;
    }
    try {
      const response = await axiosInstance.get<DownloadResponse>("/download/mine");
      setData(response.data);
      setErrorMessage("");
    } catch (error) {
      console.error("Unable to load download history:", error);
      setErrorMessage("Could not load your download history. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  return (
    <main className={styles.page}>
      <Head>
        <title>Downloads | YourTube</title>
        <meta name="description" content="View YourTube download history and remaining quota." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>YOUR LIBRARY</p>
          <h1>Downloads</h1>
          <p>Download records and quota are tracked against your current membership.</p>
        </header>

        {!user ? (
          <section className={styles.empty}>
            <h2>Sign in to view downloads</h2>
            <p>Your download history and quota are linked to your YourTube account.</p>
            <button type="button" onClick={handlegooglesignin}>Sign in with Google</button>
          </section>
        ) : loading ? (
          <p className={styles.empty}>Loading download history…</p>
        ) : errorMessage ? (
          <div className={styles.error} role="alert">{errorMessage}</div>
        ) : (
          <>
            <section className={styles.quota} aria-label="Download quota">
              <div>
                <p className={styles.eyebrow}>CURRENT PLAN</p>
                <h2>{data?.quota.plan || "Free"}</h2>
              </div>
              <div>
                <p className={styles.eyebrow}>USAGE THIS {data?.quota.period.toUpperCase()}</p>
                <strong>
                  {data?.quota.limit == null
                    ? `${data?.quota.used || 0} downloads · no plan limit`
                    : `${data?.quota.used || 0} of ${data.quota.limit} used`}
                </strong>
              </div>
              {data?.quota.remaining != null && (
                <div>
                  <p className={styles.eyebrow}>REMAINING</p>
                  <strong>{data.quota.remaining}</strong>
                </div>
              )}
              <Link href="/plans" className={styles.planLink}>View plans</Link>
            </section>

            <section className={styles.history} aria-label="Download history">
              <h2>Download history</h2>
              {!data?.downloads.length ? (
                <p className={styles.empty}>No downloads recorded yet. Visit a video and use Download to get started.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Video</th>
                        <th>Date and time</th>
                        <th>File size</th>
                        <th>Plan</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.downloads.map((download) => (
                        <tr key={download._id}>
                          <td>
                            <Link href={`/watch/${download.videoId}`}>{download.videoTitle}</Link>
                          </td>
                          <td>{formatDate(download.downloadedAt)}</td>
                          <td>{download.fileSize}</td>
                          <td>{download.plan}</td>
                          <td>
                            <span className={`${styles.status} ${styles[download.status]}`}>
                              {download.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
