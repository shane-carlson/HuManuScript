import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createAccountApp } from './http.mjs';

const port = Number(process.env.ACCOUNT_PORT || 8787);
const file = process.env.ACCOUNT_DATA || fileURLToPath(new URL('./data/accounts.json', import.meta.url));
const app = createAccountApp({ file });

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const host = req.headers.host || `127.0.0.1:${port}`;
  const request = new Request(`http://${host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
  const response = await app.handle(request);
  const headers = Object.fromEntries(response.headers.entries());
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`HuManuScript accounts listening on http://127.0.0.1:${port}`);
});
