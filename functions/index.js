const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

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
