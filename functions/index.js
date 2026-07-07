const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const TWILIO_AUTH_TOKEN  = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_VERIFY_SID  = defineSecret("TWILIO_VERIFY_SID");

const TWILIO_SECRETS = [TWILIO_AUTH_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_VERIFY_SID];

initializeApp();

exports.sendVerificationCode = onCall(
  { cors: true, region: "us-central1", secrets: TWILIO_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
    const { phone } = request.data;
    if (!phone) throw new HttpsError("invalid-argument", "phone required");

    const twilio = require("twilio")(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
    try {
      await twilio.verify.v2.services(TWILIO_VERIFY_SID.value())
        .verifications.create({ to: phone, channel: "sms" });
      return { success: true };
    } catch (e) {
      throw new HttpsError("internal", e.message);
    }
  }
);

exports.verifyCode = onCall(
  { cors: true, region: "us-central1", secrets: TWILIO_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
    const { phone, code } = request.data;
    if (!phone || !code) throw new HttpsError("invalid-argument", "phone and code required");

    const twilio = require("twilio")(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
    try {
      const check = await twilio.verify.v2.services(TWILIO_VERIFY_SID.value())
        .verificationChecks.create({ to: phone, code: String(code) });
      if (check.status !== "approved") throw new HttpsError("invalid-argument", "קוד שגוי");
      return { success: true };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError("internal", e.message);
    }
  }
);

exports.callAnthropic = onCall({ cors: true, region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const db = getFirestore();
  const settingsDoc = await db.collection("config").doc("settings").get();
  const apiKey = settingsDoc.data()?.anthropicKey;

  if (!apiKey) {
    throw new HttpsError("not-found", "Anthropic API key not configured in admin panel");
  }

  const { model, max_tokens, system, messages } = request.data;

  if (!messages || !Array.isArray(messages)) {
    throw new HttpsError("invalid-argument", "messages array required");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: max_tokens || 512,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new HttpsError("internal", `Anthropic error: ${text}`);
  }

  return await response.json();
});
