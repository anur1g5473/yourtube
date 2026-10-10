const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export const sendSubscriptionReceipt = async (subscription, email, displayName) => {
  let deliveryError = null;
  let providerMessageId;
  if (!process.env.RESEND_API_KEY || !process.env.SECURITY_EMAIL_FROM) {
    deliveryError = new Error("Receipt email requires RESEND_API_KEY and SECURITY_EMAIL_FROM");
  } else {
    const text = [
      `Hello ${displayName || "YourTube member"},`,
      "",
      "Your YourTube subscription payment has been verified.",
      "",
      `Plan: ${subscription.plan}`,
      `Billing period: ${subscription.billingPeriod}`,
      `Amount paid: ${subscription.currency} ${Number(subscription.price).toFixed(2)}`,
      `Payment status: ${subscription.paymentStatus}`,
      `Invoice number: ${subscription.invoiceNumber}`,
      `Order ID: ${subscription.orderId}`,
      `Payment ID: ${subscription.paymentId}`,
      `Valid from: ${formatDate(subscription.startDate)}`,
      `Valid until: ${formatDate(subscription.endDate)}`,
      "",
      `For billing support, contact ${process.env.SUPPORT_EMAIL || process.env.SECURITY_EMAIL_FROM}.`,
      "",
      "Thank you for choosing YourTube.",
    ].join("\n");

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `yourtube-subscription-receipt-${subscription._id}`,
        },
        body: JSON.stringify({
          from: process.env.SECURITY_EMAIL_FROM,
          to: [email],
          subject: `Your YourTube ${subscription.plan} subscription receipt`,
          text,
        }),
      });
      if (!response.ok) {
        deliveryError = new Error(`Receipt delivery failed with status ${response.status}`);
      } else {
        providerMessageId = (await response.json()).id;
      }
    } catch (error) {
      deliveryError = error;
    }
  }

  subscription.receiptEmailStatus = deliveryError ? "failed" : "sent";
  subscription.receiptSentAt = deliveryError ? undefined : new Date();
  if (providerMessageId) subscription.receiptMessageId = providerMessageId;
  await subscription.save();

  if (deliveryError) {
    console.error("Subscription receipt email was not sent:", deliveryError.message);
    return { status: "failed" };
  }
  return { status: "sent" };
};
