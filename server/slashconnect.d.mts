import type { IncomingMessage, Server, ServerResponse } from "node:http";

type Dispatch = (input: { method: string; url: string; token?: string; body?: unknown; clientDate?: string }) => Promise<{ status: number; body: unknown }>;

export function createSlashApp(options?: {
  dataFile?: string;
  seedDemo?: boolean;
  hosted?: boolean;
  tokenPrefix?: string;
  store?: { read: () => unknown; write: (next: unknown) => void };
}): {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  dispatch: Dispatch;
  listen: (port?: number, host?: string) => Server;
  dataFile: string;
};
