import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import styles from "./plans.module.css";

type BillingPeriod = "monthly" | "quarterly" | "yearly";
type Plan = {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
};
type Subscription = {
  _id?: string;
  plan: string;
  status: string;
  price?: number;
  currency?: string;
  billingPeriod?: string;
  paymentStatus?: string;
  invoiceNumber?: string;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  remainingDays?: number;
  receiptEmailStatus?: "pending" | "sent" | "failed";
};
type BillingResponse = {
  subscription: Subscription;
  billingHistory: Subscription[];
};
type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayInstance = {
  open: () => void;
  close: () => void;
  on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void;
};
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccess) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const periods: { id: BillingPeriod; label: string; months: number; multiplier: number }[] = [
  { id: "monthly", label: "Monthly", months: 1, multiplier: 1 },
  { id: "quarterly", label: "Quarterly", months: 3, multiplier: 2.7 },
  { id: "yearly", label: "Yearly", months: 12, multiplier: 9.6 },
];

const formatDate = (date?: string) =>
  date ? new Date(date).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";

export default function PlansPage() {
  const { user, handlegooglesignin } = useUser();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [account, setAccount] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [busyReceiptId, setBusyReceiptId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadAccount = useCallback(async () => {
    if (!user) {
      setAccount(null);
      setLoading(false);
      return;
    }

    try {
      const response = await axiosInstance.get<BillingResponse>("/subscription/me");
      setAccount(response.data);
      setErrorMessage("");
    } catch (error) {
      console.error("Unable to load subscription details:", error);
      setErrorMessage("Could not load your subscription. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const response = await axiosInstance.get<Plan[]>("/subscription/plans");
        setPlans(response.data);
      } catch (error) {
        console.error("Unable to load subscription plans:", error);
        setErrorMessage("Could not load subscription plans. Please refresh to try again.");
      }
    };
    loadPlans();
  }, []);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const buyPlan = async (plan: Plan) => {
    if (!user) {
      await handlegooglesignin();
      return;
    }
    if (plan.id === "free") return;

    setBusyPlan(plan.id);
    setNotice("");
    setErrorMessage("");
    try {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      const loaded = await new Promise<boolean>((resolve) => {
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
      });
      if (!loaded || !window.Razorpay) {
        throw new Error("Unable to load the Razorpay checkout. Check your connection and retry.");
      }

      const orderResponse = await axiosInstance.post("/subscription/orders", {
        plan: plan.id,
        billingPeriod,
      });
      const selectedPeriod = periods.find((period) => period.id === billingPeriod)!;
      const checkout = new window.Razorpay({
        key: orderResponse.data.keyId,
        amount: orderResponse.data.amount,
        currency: orderResponse.data.currency,
        name: "YourTube",
        description: `${plan.name} · ${selectedPeriod.label}`,
        order_id: orderResponse.data.orderId,
        theme: { color: "#185ADB" },
        modal: { ondismiss: () => setBusyPlan(null) },
        handler: async (payment) => {
          try {
            const verification = await axiosInstance.post("/subscription/verify", {
              orderId: payment.razorpay_order_id,
              paymentId: payment.razorpay_payment_id,
              signature: payment.razorpay_signature,
            });
            setNotice(
              verification.data.receiptEmailStatus === "sent"
                ? "Payment verified. Your subscription is active and the receipt was emailed."
                : "Payment verified and your subscription is active, but the receipt email failed. Retry it from billing history."
            );
            await loadAccount();
          } catch (error: any) {
            console.error("Subscription payment verification failed:", error);
            setErrorMessage(
              error.response?.data?.message || "Payment could not be verified. Contact support before retrying."
            );
          } finally {
            setBusyPlan(null);
          }
        },
      });
      checkout.on("payment.failed", (event) => {
        setNotice("");
        setErrorMessage(event.error?.description
          ? `Payment failed: ${event.error.description}. No plan was activated.`
          : "Payment failed. No plan was activated.");
        setBusyPlan(null);
        window.setTimeout(() => checkout.close(), 300);
      });
      checkout.open();
    } catch (error: any) {
      console.error("Unable to start subscription checkout:", error);
      setErrorMessage(error.response?.data?.message || error.message || "Unable to start checkout.");
      setBusyPlan(null);
    }
  };

  const resendReceipt = async (subscriptionId?: string) => {
    if (!subscriptionId) return;
    setBusyReceiptId(subscriptionId);
    setErrorMessage("");
    setNotice("");
    try {
      const response = await axiosInstance.post(`/subscription/receipts/${subscriptionId}/resend`);
      setNotice(response.data.message || "Receipt email sent.");
      await loadAccount();
    } catch (error: any) {
      console.error("Unable to resend subscription receipt:", error);
      setErrorMessage(error.response?.data?.message || "Receipt email could not be sent.");
    } finally {
      setBusyReceiptId(null);
    }
  };

  const cancelSubscription = async () => {
    setBusyPlan("cancel");
    setErrorMessage("");
    try {
      await axiosInstance.post("/subscription/cancel");
      setNotice("Plan cancelled. Your current access remains available until expiry.");
      await loadAccount();
    } catch (error: any) {
      console.error("Unable to cancel subscription:", error);
      setErrorMessage(error.response?.data?.message || "Could not cancel the subscription.");
    } finally {
      setBusyPlan(null);
    }
  };

  const currentPlan = plans.find((plan) => plan.id === account?.subscription.plan);
  const currentPeriod = periods.find((period) => period.id === billingPeriod)!;
  const currentSubscription = account?.subscription;

  return (
    <main className={styles.page}>
      <Head>
        <title>Plans and billing | YourTube</title>
        <meta name="description" content="Compare YourTube membership plans and manage your subscription." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={styles.container}>
        <header className={styles.intro}>
          <p className={styles.eyebrow}>YOURTUBE MEMBERSHIP</p>
          <h1>Choose how you watch.</h1>
          <p>Compare plans, unlock more viewing benefits, and manage your billing in one place.</p>
        </header>

        {notice && <div className={styles.notice} role="status">{notice}</div>}
        {errorMessage && <div className={styles.error} role="alert">{errorMessage}</div>}

        {user && (
          <section className={styles.currentPlan} aria-label="Current subscription">
            <div>
              <p className={styles.eyebrow}>CURRENT PLAN</p>
              <h2>{loading ? "Loading…" : currentPlan?.name || currentSubscription?.plan || "Free"}</h2>
              <p>
                {currentSubscription?.status === "active"
                  ? `${currentSubscription.remainingDays ?? 0} days remaining · renewal date ${formatDate(currentSubscription.renewalDate)}`
                  : currentSubscription?.status === "cancelled"
                    ? `Cancelled · access until ${formatDate(currentSubscription.endDate)}`
                    : "Basic access"}
              </p>
            </div>
            {currentSubscription?.status === "active" &&
              currentSubscription.plan !== "free" &&
              currentSubscription.endDate && (
                <button
                  className={styles.cancelButton}
                  type="button"
                  disabled={busyPlan === "cancel"}
                  onClick={cancelSubscription}
                >
                  {busyPlan === "cancel" ? "Cancelling…" : "Cancel plan"}
                </button>
              )}
          </section>
        )}

        <section className={styles.planSection} aria-label="Available plans">
          <div className={styles.planHeading}>
            <div>
              <h2>Membership plans</h2>
              <p>Paid memberships use Razorpay test checkout.</p>
            </div>
            <div className={styles.periodPicker} aria-label="Billing period">
              {periods.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  aria-pressed={billingPeriod === period.id}
                  className={billingPeriod === period.id ? styles.periodActive : ""}
                  onClick={() => setBillingPeriod(period.id)}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.planGrid}>
            {plans.map((plan) => {
              const price = Math.round(plan.price * currentPeriod.multiplier);
              const isCurrent = plan.id === currentSubscription?.plan && currentSubscription?.status === "active";
              return (
                <article className={`${styles.planCard} ${plan.id === "silver" ? styles.featured : ""}`} key={plan.id}>
                  <div className={styles.planName}>{plan.name}</div>
                  <p className={styles.description}>{plan.description}</p>
                  <p className={styles.price}>
                    ₹{price.toLocaleString("en-IN")}
                    <span> / {currentPeriod.months === 1 ? "month" : `${currentPeriod.months} months`}</span>
                  </p>
                  {billingPeriod !== "monthly" && plan.price > 0 && (
                    <p className={styles.saving}>
                      {billingPeriod === "quarterly" ? "10% less than monthly billing" : "20% less than monthly billing"}
                    </p>
                  )}
                  <ul className={styles.features}>
                    {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                  <button
                    className={styles.chooseButton}
                    type="button"
                    disabled={busyPlan !== null || isCurrent}
                    onClick={() => buyPlan(plan)}
                  >
                    {busyPlan === plan.id
                      ? "Opening checkout…"
                      : isCurrent
                        ? "Current plan"
                        : plan.id === "free"
                          ? "Included"
                          : user
                            ? `Choose ${plan.name}`
                            : `Sign in to choose`}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {user && (
          <section className={styles.historySection}>
            <h2>Billing history</h2>
            {!account?.billingHistory.length ? (
              <p className={styles.emptyState}>Your completed purchases will appear here.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr><th>Plan</th><th>Purchased</th><th>Valid until</th><th>Amount</th><th>Status</th><th>Invoice</th><th>Receipt</th></tr>
                  </thead>
                  <tbody>
                    {account.billingHistory.map((entry) => (
                      <tr key={entry._id || entry.invoiceNumber}>
                        <td>{entry.plan}</td>
                        <td>{formatDate(entry.startDate)}</td>
                        <td>{formatDate(entry.endDate)}</td>
                        <td>{entry.paymentStatus === "paid" ? `₹${entry.price?.toLocaleString("en-IN")}` : "Free"}</td>
                        <td>{entry.status}</td>
                        <td>{entry.invoiceNumber || "—"}</td>
                        <td>
                          {entry.paymentStatus !== "paid" ? "—" : entry.receiptEmailStatus === "sent" ? "Emailed" : (
                            <button
                              type="button"
                              onClick={() => void resendReceipt(entry._id)}
                              disabled={!entry._id || busyReceiptId === entry._id}
                            >
                              {busyReceiptId === entry._id ? "Sending…" : "Retry email"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!user && (
          <p className={styles.signInPrompt}>
            <button type="button" onClick={handlegooglesignin}>Sign in</button> to view your current plan and billing history.
          </p>
        )}
      </div>
    </main>
  );
}
