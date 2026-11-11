import { accountPage } from './pages.mjs';
import { createAccountStore } from './store.mjs';
import { writingTool } from './tools.mjs';

const BYTE_LIMIT = 4_500_000;

export function createAccountApp({ file = null } = {}) {
  const store = createAccountStore({ file });

  async function handle(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    if (request.method === 'GET') {
      const page = accountPage(url.pathname, url.searchParams);
      if (page) return cors(html(page));
    }
    const body = await readBody(request);
    if (body && body.error) return cors(json({ message: body.error }, body.status));
    const token = bearer(request);
    const result = await route(store, request.method, url.pathname, body?.value ?? null, token, request.headers.get('If-Match'));
    return cors(result);
  }

  return { store, handle };
}

async function route(store, method, pathname, body, token, ifMatch) {
  if (method === 'POST' && pathname === '/api/account/signup') return signup(store, body);
  if (method === 'POST' && pathname === '/api/account/login') return login(store, body);
  if (method === 'POST' && pathname === '/api/account/logout') {
    if (token) store.logout(token);
    return json({ ok: true });
  }
  if (method === 'GET' && pathname === '/api/account/me') return me(store, token);
  if (method === 'PATCH' && pathname === '/api/account/profile') return profile(store, token, body);
  if (method === 'POST' && pathname === '/api/account/password') return password(store, token, body);
  if (method === 'GET' && pathname === '/api/account/tools') return tools(store, token);
  if (method === 'POST' && pathname === '/api/account/tools') return connect(store, token, body);
  const sync = pathname.match(/^\/api\/sync\/([a-z0-9-]+)$/);
  if (sync && method === 'GET') return readSync(store, token, sync[1]);
  if (sync && method === 'PUT') return writeSync(store, token, sync[1], body, ifMatch);
  return json({ message: 'That page is not on this account service.' }, 404);
}

function signup(store, body) {
  const fields = accountFields(body, true);
  if (fields.error) return json({ message: fields.error }, 400);
  const created = store.createUser(fields);
  if (!created.ok) return json({ message: created.message }, created.status);
  return sessionJson(created);
}

function login(store, body) {
  const fields = accountFields(body, false);
  if (fields.error) return json({ message: fields.error }, 400);
  const signedIn = store.login(fields);
  if (!signedIn.ok) return json({ message: signedIn.message }, signedIn.status);
  return sessionJson(signedIn);
}

function me(store, token) {
  const user = token ? store.userForToken(token) : null;
  if (!user) return json({ message: 'Sign in again.' }, 401);
  return json({ user: wireUser(user) });
}

function profile(store, token, body) {
  const name = typeof body?.displayName === 'string' ? body.displayName : '';
  const invalid = validateName(name);
  if (invalid) return json({ message: invalid }, 400);
  const updated = store.updateProfile(token, name);
  if (!updated.ok) return json({ message: updated.message }, updated.status);
  return json({ user: wireUser(updated.user) });
}

function password(store, token, body) {
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const nextPassword = typeof body?.password === 'string' ? body.password : '';
  const invalid = validatePassword(nextPassword);
  if (!currentPassword) return json({ message: 'Enter the current password.' }, 400);
  if (invalid) return json({ message: invalid }, 400);
  const changed = store.changePassword(token, currentPassword, nextPassword);
  if (!changed.ok) return json({ message: changed.message }, changed.status);
  return json({ ok: true });
}

function tools(store, token) {
  const listed = store.toolsFor(token);
  if (!listed.ok) return json({ message: listed.message }, listed.status);
  return json({ tools: listed.tools });
}

function connect(store, token, body) {
  const tool = typeof body?.tool === 'string' ? body.tool : '';
  const connected = store.connectTool(token, tool);
  if (!connected.ok) return json({ message: connected.message }, connected.status);
  return json({ tools: connected.tools });
}

function readSync(store, token, toolId) {
  const read = store.readSnapshot(token, toolId);
  if (!read.ok) return json({ message: read.message }, read.status);
  if (!read.snapshot) return json({ snapshot: null }, 200, null);
  return json(
    { snapshot: read.snapshot.body, revision: read.snapshot.revision, updatedAt: read.snapshot.updatedAt },
    200,
    read.snapshot.revision,
  );
}

function writeSync(store, token, toolId, body, ifMatch) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ message: 'The account snapshot was empty. Your books were not changed.' }, 400);
  }
  const written = store.writeSnapshot(token, toolId, body, ifMatch);
  if (!written.ok && written.status === 409) {
    const current = written.snapshot;
    return json(
      current
        ? { snapshot: current.body, revision: current.revision, updatedAt: current.updatedAt }
        : { snapshot: null },
      409,
      current?.revision ?? null,
    );
  }
  if (!written.ok) return json({ message: written.message }, written.status);
  return json(
    { revision: written.snapshot.revision, updatedAt: written.snapshot.updatedAt },
    200,
    written.snapshot.revision,
  );
}

function sessionJson(result) {
  return json({
    token: result.token,
    tokenType: 'Bearer',
    user: wireUser(result.user),
  });
}

function wireUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

function accountFields(body, creating) {
  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const displayName = typeof body?.displayName === 'string' ? body.displayName : '';
  const tool = typeof body?.tool === 'string' && body.tool ? body.tool : 'humanuscript';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { error: 'Enter a valid email address.' };
  if (creating) {
    const nameError = validateName(displayName);
    if (nameError) return { error: nameError };
    const passwordError = validatePassword(password);
    if (passwordError) return { error: passwordError };
  } else if (!password) {
    return { error: 'Enter the password for that account.' };
  }
  if (!writingTool(tool)) return { error: 'That writing tool is not part of this account yet.' };
  return { email, password, displayName, tool: creating || tool ? tool : null };
}

function validateName(displayName) {
  const name = displayName.trim();
  if (!name) return 'Display name is required.';
  if (name.length > 40) return 'Use a name of 40 characters or fewer.';
  return null;
}

function validatePassword(password) {
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Password needs both uppercase and lowercase letters.';
  if (!/\d/.test(password)) return 'Password needs a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password needs a symbol.';
  return null;
}

function bearer(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)$/);
  return match ? match[1] : '';
}

async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return { value: null };
  const text = await request.text();
  if (!text) return { value: null };
  if (Buffer.byteLength(text) > BYTE_LIMIT) return { error: 'This library is too large to sync.', status: 413 };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: 'That did not work. Check the details and try again.', status: 400 };
  }
}

function json(value, status = 200, revision = null) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (revision) headers.ETag = `"${revision}"`;
  return new Response(JSON.stringify(value), { status, headers });
}

function html(markup) {
  return new Response(markup, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match, Accept');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  headers.set('Access-Control-Expose-Headers', 'ETag');
  return new Response(response.body, { status: response.status, headers });
}
