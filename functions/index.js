import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { firestoreStore } from "./firestoreStore.js";
// Built from server/hosted.mjs by `npm run build:functions`.
import { createHostedApp, errorBody } from "./lib/hosted.mjs";

// With this set, the Admin SDK takes ID tokens without checking who signed them.
// The emulators set it for themselves. Anywhere else it would let anyone in.
if (process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FUNCTIONS_EMULATOR !== "true") {
  throw new Error("FIREBASE_AUTH_EMULATOR_HOST is set outside the Firebase emulators. Remove it before deploying.");
}

initializeApp();

/**
 * Says whose Firebase ID token this is, or nothing if it is not a good one.
 * Everything the app does for a person starts from this answer.
 */
async function verifyToken(token) {
  try {
    const claims = await getAuth().verifyIdToken(token);
    return { uid: claims.uid, email: claims.email || "", emailVerified: claims.email_verified === true };
  } catch (error) {
    // Not being able to fetch Google's signing keys is our trouble, not a bad token,
    // and must not sign anyone out.
    if (!String(error?.code || "").startsWith("auth/") || /Error fetching/.test(String(error?.message))) throw error;
    return null;
  }
}

let hosted;
function app() {
  hosted ||= createHostedApp({
    store: firestoreStore(getFirestore()),
    verifyToken,
    testerCode: process.env.TESTER_CODE || "",
    // Set by the Firebase emulators, never in the cloud. The app then signs in against the emulator too.
    authEmulator: process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
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
    res.status(error.status || 500).json(errorBody(error));
  }
});
