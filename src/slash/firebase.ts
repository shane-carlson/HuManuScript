import type { Auth } from "firebase/auth";
// Filled in by `npm run firebase:register`, from the web app registered in the Firebase project.
import config from "./firebase.config.json";

type AuthSdk = typeof import("firebase/auth");

/** False until the web app is registered and its config is written into firebase.config.json. */
export const firebaseConfigured = Boolean(config.apiKey && config.appId);

// Only ever used with the Auth emulator, which accepts any key and holds no real accounts.
const EMULATOR_CONFIG = { apiKey: "demo-slashconnect", authDomain: "demo-slashconnect.firebaseapp.com", projectId: "demo-slashconnect" };

let loaded: Promise<{ auth: Auth; sdk: AuthSdk }> | null = null;

/**
 * Firebase Authentication, fetched the first time a hosted build needs it, so
 * the build that runs on one computer never downloads it. `emulator` is the
 * address of a local Auth emulator, or empty for the real project.
 */
export function firebaseAuth(emulator = ""): Promise<{ auth: Auth; sdk: AuthSdk }> {
  loaded ||= load(emulator).catch((error: unknown) => {
    loaded = null;
    throw error;
  });
  return loaded;
}

async function load(emulator: string) {
  const [{ initializeApp }, sdk] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  const app = initializeApp(emulator ? EMULATOR_CONFIG : config);
  // Not getAuth(): that also sets up sign-in by popup and redirect, which can hang
  // on the capacitor:// address the iOS app runs from. Email and password need neither.
  const auth = sdk.initializeAuth(app, { persistence: [sdk.indexedDBLocalPersistence, sdk.browserLocalPersistence] });
  if (emulator) sdk.connectAuthEmulator(auth, emulator, { disableWarnings: true });
  return { auth, sdk };
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password don’t match.",
  "auth/invalid-login-credentials": "That email and password don’t match.",
  "auth/wrong-password": "That email and password don’t match.",
  "auth/user-not-found": "That email and password don’t match.",
  "auth/email-already-in-use": "That email’s already signed up here. Try signing in.",
  "auth/weak-password": "That password’s a bit short. Use at least 6 characters.",
  "auth/password-does-not-meet-requirements": "That password needs to be stronger. Make it longer and mix it up.",
  "auth/missing-password": "Add your password.",
  "auth/invalid-email": "That doesn’t look like an email address.",
  "auth/missing-email": "Add your email address.",
  "auth/too-many-requests": "Too many tries. Give it a few minutes, or reset your password.",
  "auth/network-request-failed": "Can’t reach SlashConnect right now. Check your connection and try again.",
  "auth/user-disabled": "This account’s been switched off. Ask whoever runs the test.",
  "auth/user-token-expired": "You’ve been signed out. Sign back in.",
  "auth/operation-not-allowed": "Email sign-in isn’t switched on for this build yet. Tell whoever set it up.",
  "auth/invalid-api-key": "This build isn’t connected to Firebase properly yet. Tell whoever set it up.",
};

/** A Firebase error code, if that is what was thrown. */
export function authCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("auth/") ? code : "";
}

/** True when Firebase refused the email and password themselves, rather than failing some other way. */
export function wrongPassword(error: unknown) {
  return ["auth/invalid-credential", "auth/invalid-login-credentials", "auth/wrong-password", "auth/user-not-found"].includes(authCode(error));
}

/** What to tell the person when Firebase says no. */
export function authMessage(error: unknown) {
  const code = authCode(error);
  if (code.startsWith("auth/api-key-not-valid")) return MESSAGES["auth/invalid-api-key"];
  return MESSAGES[code] || "That didn’t work. Try again?";
}
