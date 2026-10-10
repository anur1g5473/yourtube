const getTwilioConfig = () => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) return null;
  return { accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, serviceSid: TWILIO_VERIFY_SERVICE_SID };
};

export const isTwilioVerifyConfigured = () => Boolean(getTwilioConfig());

const requestVerification = async (action, values) => {
  const config = getTwilioConfig();
  if (!config) throw new Error("Twilio Verify is not configured");
  const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.serviceSid)}/${action}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
  });
  if (!response.ok) {
    const error = new Error(`Twilio Verify request failed with status ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return response.json();
};

export const sendSmsVerification = async (phoneNumber) =>
  requestVerification("Verifications", { To: phoneNumber, Channel: "sms" });

export const checkSmsVerification = async (phoneNumber, code) => {
  try {
    const result = await requestVerification("VerificationCheck", { To: phoneNumber, Code: code });
    return result.status === "approved";
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 404) return false;
    throw error;
  }
};
