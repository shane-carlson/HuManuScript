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

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<Bundle> {
  let response: Response;
  try {
    response = await fetch(serverUrl(path), {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        "x-client-date": clientDate(),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "Can’t reach SlashConnect right now. Check your connection and try again.");
  }
  const payload = (await response.json().catch(() => ({}))) as Bundle & { error?: string };
  if (!response.ok) throw new ApiError(response.status, payload.error || "That didn’t work. Try again?");
  return payload;
}
