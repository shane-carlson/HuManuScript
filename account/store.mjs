import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { WRITING_TOOLS, writingTool } from './tools.mjs';

const SNAPSHOT_BYTE_LIMIT = 4_400_000;

export function createAccountStore({ file = null } = {}) {
  const users = new Map();
  const sessions = new Map();

  if (file) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(raw.users)) {
        for (const user of raw.users) {
          if (user && typeof user.id === 'string') users.set(user.id, user);
        }
      }
      if (Array.isArray(raw.sessions)) {
        for (const session of raw.sessions) {
          if (session && typeof session.tokenHash === 'string') sessions.set(session.tokenHash, session);
        }
      }
    } catch {
      /* A missing file starts an empty account book. */
    }
  }

  const persist = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        users: [...users.values()],
        sessions: [...sessions.values()],
      }),
    );
  };

  return {
    snapshotByteLimit: SNAPSHOT_BYTE_LIMIT,
    createUser({ email, password, displayName, tool }) {
      const normalized = email.trim().toLowerCase();
      if ([...users.values()].some((user) => user.email === normalized)) {
        return { ok: false, status: 409, message: 'An account with that email already exists.' };
      }
      const salt = randomBytes(16).toString('base64url');
      const id = `acct-${randomBytes(8).toString('hex')}`;
      const user = {
        id,
        email: normalized,
        displayName: displayName.trim(),
        passwordHash: hashPassword(password, salt),
        passwordSalt: salt,
        tools: tool ? [tool] : [],
        snapshots: {},
      };
      users.set(id, user);
      persist();
      return { ok: true, user: publicUser(user), token: openSession(sessions, user.id, persist) };
    },
    login({ email, password, tool }) {
      const normalized = email.trim().toLowerCase();
      const user = [...users.values()].find((item) => item.email === normalized);
      if (!user || !passwordMatches(password, user)) {
        return { ok: false, status: 401, message: 'Email or password is incorrect.' };
      }
      if (tool && !user.tools.includes(tool)) {
        user.tools.push(tool);
        persist();
      }
      return { ok: true, user: publicUser(user), token: openSession(sessions, user.id, persist) };
    },
    userForToken(token) {
      const session = sessions.get(hashToken(token));
      if (!session) return null;
      const user = users.get(session.userId);
      return user ? publicUser(user) : null;
    },
    logout(token) {
      sessions.delete(hashToken(token));
      persist();
    },
    updateProfile(token, displayName) {
      const user = privateUser(users, sessions, token);
      if (!user) return { ok: false, status: 401, message: 'Sign in again.' };
      user.displayName = displayName.trim();
      persist();
      return { ok: true, user: publicUser(user) };
    },
    changePassword(token, currentPassword, nextPassword) {
      const user = privateUser(users, sessions, token);
      if (!user) return { ok: false, status: 401, message: 'Sign in again.' };
      if (!passwordMatches(currentPassword, user)) {
        return { ok: false, status: 401, message: 'The current password is incorrect.' };
      }
      user.passwordSalt = randomBytes(16).toString('base64url');
      user.passwordHash = hashPassword(nextPassword, user.passwordSalt);
      persist();
      return { ok: true };
    },
    connectTool(token, toolId) {
      const user = privateUser(users, sessions, token);
      if (!user) return { ok: false, status: 401, message: 'Sign in again.' };
      const tool = writingTool(toolId);
      if (!tool) return { ok: false, status: 400, message: 'That writing tool is not part of this account yet.' };
      if (!user.tools.includes(tool.id)) user.tools.push(tool.id);
      persist();
      return { ok: true, tools: toolCatalog(user) };
    },
    toolsFor(token) {
      const user = privateUser(users, sessions, token);
      if (!user) return { ok: false, status: 401, message: 'Sign in again.' };
      return { ok: true, tools: toolCatalog(user) };
    },
    readSnapshot(token, toolId) {
      const user = privateUser(users, sessions, token);
      if (!user) return { ok: false, status: 401, message: 'Sign in again to sync. Your books are still on this computer.' };
      const tool = writingTool(toolId);
      if (!tool?.sync) return { ok: false, status: 404, message: 'That writing tool does not sync from HuManuScript.' };
      const saved = user.snapshots[toolId] ?? null;
      return { ok: true, snapshot: saved };
    },
    writeSnapshot(token, toolId, body, ifMatch) {
      const user = privateUser(users, sessions, token);
      if (!user) return { ok: false, status: 401, message: 'Sign in again to sync. Your books are still on this computer.' };
      const tool = writingTool(toolId);
      if (!tool?.sync) return { ok: false, status: 404, message: 'That writing tool does not sync from HuManuScript.' };
      const bytes = Buffer.byteLength(JSON.stringify(body));
      if (bytes > SNAPSHOT_BYTE_LIMIT) {
        return { ok: false, status: 413, message: 'This library is too large to sync.' };
      }
      const current = user.snapshots[toolId] ?? null;
      const expected = unquote(ifMatch);
      if (current && expected !== current.revision) {
        return { ok: false, status: 409, snapshot: current };
      }
      if (!current && expected) {
        return { ok: false, status: 409, snapshot: null };
      }
      const saved = {
        revision: randomBytes(8).toString('hex'),
        updatedAt: new Date().toISOString(),
        body,
      };
      user.snapshots[toolId] = saved;
      persist();
      return { ok: true, snapshot: saved };
    },
  };
}

function toolCatalog(user) {
  return WRITING_TOOLS.map((tool) => ({
    id: tool.id,
    name: tool.name,
    sync: tool.sync,
    connected: user.tools.includes(tool.id),
  }));
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    tools: [...user.tools],
  };
}

function privateUser(users, sessions, token) {
  const session = sessions.get(hashToken(token));
  if (!session) return null;
  return users.get(session.userId) ?? null;
}

function openSession(sessions, userId, persist) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(hashToken(token), { tokenHash: hashToken(token), userId });
  persist();
  return token;
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('base64url');
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString('base64url');
}

function passwordMatches(password, user) {
  const next = Buffer.from(hashPassword(password, user.passwordSalt));
  const saved = Buffer.from(user.passwordHash);
  return next.length === saved.length && timingSafeEqual(next, saved);
}

function unquote(value) {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (!text) return null;
  if (text.startsWith('W/')) text = text.slice(2).trim();
  if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
  return text || null;
}
