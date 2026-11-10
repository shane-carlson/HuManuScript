import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { firestoreStore } from "./firestoreStore.js";
// Built from server/hosted.mjs by `npm run build:functions`.
import { createHostedApp } from "./lib/hosted.mjs";

initializeApp();

let hosted;
function app() {
  hosted ||= createHostedApp({
    store: firestoreStore(getFirestore()),
    testerCode: process.env.TESTER_CODE || "",
  });
  return hosted;
}

// The iOS and Android apps load their pages from inside the app, so their
// requests come from these origins instead of the Hosting address.
const APP_ORIGINS = new Set(["capacitor://localhost", "https://localhost", "http://localhost"]);

/** Firebase Hosting sends every /api request here. */
export const api = onRequest({ region: "us-central1", memory: "512MiB", maxInstances: 5 }, async (req, res) => {
  res.set("cache-control", "no-store");
  res.set("vary", "Origin");
  const origin = String(req.get("origin") || "");
  if (APP_ORIGINS.has(origin)) {
    res.set("access-control-allow-origin", origin);
    res.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.set("access-control-allow-headers", "authorization, content-type, x-client-date");
    res.set("access-control-max-age", "3600");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  try {
    const header = String(req.get("authorization") || "");
    const result = await app().dispatch({
      method: req.method,
      url: req.originalUrl || req.url,
      token: header.startsWith("Bearer ") ? header.slice(7) : "",
      body: req.body && typeof req.body === "object" ? req.body : {},
      clientDate: String(req.get("x-client-date") || ""),
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    if (!error.status) console.error(error);
    res.status(error.status || 500).json({ error: error.status ? error.message : "Something went wrong." });
  }
});
