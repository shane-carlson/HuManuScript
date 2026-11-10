import { clientDate } from "./format.ts";
import type { Bundle } from "./types.ts";

/**
 * Where the API lives. Empty on the web, where it is the same address as the page.
 * The iOS and Android builds carry their pages inside the app, so they are built
 * with the address of the hosted server.
 */
const SERVER = String(import.meta.env.VITE_SERVER_URL || "").replace(/\/+$/, "");

/** True in the iOS and Android builds, which always talk to the hosted server. */
export const remoteServer = SERVER !== "";

export function serverUrl(path: string) {
  return `${SERVER}${path}`;
}

/** The address to put in an invite link: one a partner can open in any browser. */
export function siteUrl() {
  return SERVER || window.location.origin;
}

export class ApiError extends Error {
  status: number;
  /** Set when the app has to tell one refusal from another, such as "no-profile". */
  code: string;

  constructor(status: number, message: string, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * What kind of server this is. The one on this computer keeps its own
 * passwords and a demo pair; a hosted one signs people in with Firebase.
 */
export type ServerInfo = {
  hosted: boolean;
  /** New people need a tester code unless a partner invited them. */
  testerCode: boolean;
  /** Where the Firebase Auth emulator is, when the server runs on the emulators. */
  authEmulator: string;
};

const SERVER_KEY = "slashconnect.server";

/** The last answer the server gave, for a start without a connection. */
export function rememberedServer(): ServerInfo {
  try {
    const kept = JSON.parse(localStorage.getItem(SERVER_KEY) || "null") as Partial<ServerInfo> | null;
    if (kept && typeof kept.hosted === "boolean") {
      return { hosted: remoteServer || kept.hosted, testerCode: kept.testerCode === true, authEmulator: String(kept.authEmulator || "") };
    }
  } catch {
    /* Nothing kept, or not ours. */
  }
  return { hosted: remoteServer, testerCode: false, authEmulator: "" };
}

export async function askServer(): Promise<ServerInfo> {
  const response = await fetch(serverUrl("/api/health"));
  const body = (await response.json()) as { ok?: boolean; hosted?: boolean; testerCode?: boolean; authEmulator?: string };
  if (!response.ok || body.ok !== true) throw new Error("No answer from SlashConnect.");
  const info: ServerInfo = {
    hosted: remoteServer || body.hosted === true,
    testerCode: body.testerCode === true,
    authEmulator: emulatorUrl(body.authEmulator),
  };
  localStorage.setItem(SERVER_KEY, JSON.stringify(info));
  return info;
}

/** The emulator says "127.0.0.1:9099". It sits beside the API, so it is reached at the API's host. */
function emulatorUrl(reported: unknown) {
  const port = /:(\d{2,5})$/.exec(typeof reported === "string" ? reported : "")?.[1];
  if (!port) return "";
  const host = new URL(serverUrl("/"), window.location.href).hostname;
  return `http://${host}:${port}`;
}

let idToken: (() => Promise<string | null>) | null = null;

/**
 * On a hosted server every request carries a fresh Firebase ID token. Once a
 * source is set, it is used instead of whatever token a caller passes.
 */
export function sendIdTokens(source: (() => Promise<string | null>) | null) {
  idToken = source;
}

export async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<Bundle> {
  let response: Response;
  try {
    const bearer = idToken ? await idToken() : opts.token;
    response = await fetch(serverUrl(path), {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        "x-client-date": clientDate(),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "Can’t reach SlashConnect right now. Check your connection and try again.");
  }
  const payload = (await response.json().catch(() => ({}))) as Bundle & { error?: string; code?: string };
  if (!response.ok) throw new ApiError(response.status, payload.error || "That didn’t work. Try again?", payload.code || "");
  return payload;
}
