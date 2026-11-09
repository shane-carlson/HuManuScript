import type { Bundle } from "./types.ts";

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
    response = await fetch(path, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "SlashConnect cannot reach the household server.");
  }
  const payload = (await response.json().catch(() => ({}))) as Bundle & { error?: string };
  if (!response.ok) throw new ApiError(response.status, payload.error || "Something went wrong.");
  return payload;
}
