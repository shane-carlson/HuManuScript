import type { IncomingMessage, Server, ServerResponse } from "node:http";

export function createSlashApp(options?: { dataFile?: string; seedDemo?: boolean }): {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  dispatch: (input: { method: string; url: string; token?: string; body?: unknown; clientDate?: string }) => Promise<{ status: number; body: unknown }>;
  listen: (port?: number, host?: string) => Server;
  dataFile: string;
};
