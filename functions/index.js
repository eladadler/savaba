const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

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

exports.notifyOnNewOffer = onDocumentCreated(
  { document: "offers/{offerId}", region: "us-central1" },
  async (event) => {
    const offer = event.data.data();
    const { bMm, aMm, aId, bId } = offer;
    if (!bMm || !aMm || bMm === aMm) return; // same matchmaker on both sides — skip

    const db = getFirestore();

    const [recipientSnap, senderSnap, candASnap, candBSnap] = await Promise.all([
      db.collection("users").doc(bMm).get(),
      db.collection("users").doc(aMm).get(),
      aId ? db.collection("candidates").doc(aId).get() : Promise.resolve(null),
      bId ? db.collection("candidates").doc(bId).get() : Promise.resolve(null),
    ]);

    const tokens = recipientSnap.data()?.fcmTokens || [];
    if (!tokens.length) return;

    const senderName = senderSnap.data()?.displayName || "שדכן/ית";
    const candAName  = candASnap?.data()?.name || "";
    const candBName  = candBSnap?.data()?.name || "";

    const body = candAName && candBName
      ? `${senderName} הציע/ה שידוך בין ${candAName} ל${candBName}`
      : `${senderName} שלח/ה לך הצעת שידוך חדשה`;

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: "💌 הצעת שידוך חדשה", body },
      webpush: {
        notification: { icon: "https://www.sababa-and-all.com/favicon.svg", dir: "rtl", lang: "he", requireInteraction: true },
        fcmOptions: { link: "https://www.sababa-and-all.com/#match" },
      },
    });

    // Remove stale tokens
    const stale = response.responses
      .map((r, i) => (!r.success ? tokens[i] : null))
      .filter(Boolean);
    if (stale.length) {
      await db.collection("users").doc(bMm).update({
        fcmTokens: FieldValue.arrayRemove(...stale),
      });
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
