import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createSlashApp, emptyDb, readBody, sendJson } from "./slashconnect.mjs";

/**
 * SlashConnect for many couples on one server.
 *
 * Each couple is one household record, and every request runs the same rules as
 * the single-computer build over just that record. Around it sit three small
 * indexes, because a sign-in, an invite code and a photo each have to find their
 * household before any of its data is read:
 *
 *   households/<id>               the household, as the engine keeps it
 *   households/<id>/photos/<id>   one photo each, kept out of the household record
 *   emails/<hash>                 which household an email signs in to
 *   invites/<code>                which household an open invite belongs to
 *
 * A session token starts with its household id, so it needs no index.
 *
 * `store.transaction(fn)` must run `fn` atomically and may run it more than once.
 * Inside it every `get` has to come before the first `set` or `delete`, which is
 * the rule Firestore transactions have.
 */

const HOUSEHOLD_ID = /^[a-f0-9]{24}$/;
const PHOTO_ID = /^[a-f0-9]{24}$/;
const PHOTO_REF = "photo:";
const MAX_FAILED_SIGN_INS = 8;
const LOCK_MINUTES = 15;

function fail(status, error) {
  const err = new Error(error);
  err.status = status;
  throw err;
}

const newId = () => randomBytes(12).toString("hex");
const emailKey = (email) => `emails/${createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex")}`;
const inviteKey = (code) => `invites/${code}`;
const householdKey = (id) => `households/${id}`;
const photoKey = (householdId, photoId) => `households/${householdId}/photos/${photoId}`;
const cleanCode = (value) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

function sameText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function householdOfToken(token) {
  const id = String(token || "").split(".")[0];
  return HOUSEHOLD_ID.test(id) ? id : "";
}

function openInviteCodes(db) {
  return (db?.invites || []).filter((invite) => invite.status === "open").map((invite) => invite.code);
}

export function createHostedApp(options = {}) {
  const store = options.store;
  if (!store) throw new Error("A hosted SlashConnect needs somewhere to keep its households.");
  const testerCode = String(options.testerCode || "").trim();
  const now = options.now || (() => Date.now());

  /**
   * Reads one household inside a transaction and returns the engine over it.
   * `commit` queues the writes, so call it after every read the request needs.
   */
  async function openHousehold(tx, id, { create = false, prepare } = {}) {
    const saved = await tx.get(householdKey(id));
    if (!saved && !create) return null;
    const invitesBefore = openInviteCodes(saved);
    let current = saved || emptyDb();
    let dirty = false;
    if (prepare) prepare(current);
    const engine = createSlashApp({
      hosted: true,
      tokenPrefix: `${id}.`,
      store: {
        read: () => current,
        write(next) {
          current = next;
          dirty = true;
        },
      },
    });
    return {
      id,
      saved,
      db: () => current,
      dispatch: (input) => engine.dispatch(input),
      commit() {
        if (!dirty) return;
        // Photos live beside the household, so its record stays small however many are shared.
        // Finished tasks stay on the record, so a photo is never taken back out.
        for (const task of current.tasks || []) {
          const photos = task.completion?.photos;
          if (!Array.isArray(photos)) continue;
          task.completion.photos = photos.map((photo) => {
            if (typeof photo !== "string" || !photo.startsWith("data:")) return photo;
            const photoId = newId();
            tx.set(photoKey(id, photoId), { data: photo });
            return `${PHOTO_REF}${photoId}`;
          });
        }
        const open = new Set(openInviteCodes(current));
        for (const code of open) if (!invitesBefore.includes(code)) tx.set(inviteKey(code), { household: id });
        for (const code of invitesBefore) if (!open.has(code)) tx.delete(inviteKey(code));
        tx.set(householdKey(id), current);
      },
    };
  }

  function signedOut() {
    fail(401, "You’ve been signed out. Sign back in.");
  }

  async function register(input) {
    const body = input.body || {};
    const code = cleanCode(body.inviteCode);
    if (testerCode && !code && !sameText(String(body.testerCode || "").trim().toLowerCase(), testerCode.toLowerCase())) {
      fail(403, "This test is invite only. Ask whoever sent you here for the tester code.");
    }
    return store.transaction(async (tx) => {
      const taken = await tx.get(emailKey(body.email));
      if (taken) fail(409, "That email’s already signed up here. Try signing in.");
      let id = newId();
      if (code) {
        const invite = await tx.get(inviteKey(code));
        if (!invite) fail(404, "That code isn’t open. Check it with your partner.");
        id = invite.household;
      }
      const house = await openHousehold(tx, id, { create: !code });
      if (!house) fail(404, "That code isn’t open. Check it with your partner.");
      const result = await house.dispatch({ ...input, body: { ...body, inviteCode: code || undefined } });
      house.commit();
      tx.set(emailKey(body.email), { household: id });
      return result;
    });
  }

  async function login(input) {
    const body = input.body || {};
    const wrong = "That email and password don’t match.";
    const outcome = await store.transaction(async (tx) => {
      const key = emailKey(body.email);
      const entry = await tx.get(key);
      if (!entry) return { error: Object.assign(new Error(wrong), { status: 401 }) };
      if (entry.lockedUntil && entry.lockedUntil > now()) {
        return { error: Object.assign(new Error(`Too many tries. Give it ${LOCK_MINUTES} minutes and try again.`), { status: 429 }) };
      }
      const house = await openHousehold(tx, entry.household);
      if (!house) return { error: Object.assign(new Error(wrong), { status: 401 }) };
      try {
        const result = await house.dispatch(input);
        house.commit();
        if (entry.fails || entry.lockedUntil) tx.set(key, { household: entry.household });
        return { result };
      } catch (error) {
        if (error.status !== 401) throw error;
        // Counted here rather than thrown, so the count is saved with the failed try.
        const fails = (entry.fails || 0) + 1;
        tx.set(key, fails >= MAX_FAILED_SIGN_INS
          ? { household: entry.household, lockedUntil: now() + LOCK_MINUTES * 60000 }
          : { household: entry.household, fails });
        return { error };
      }
    });
    if (outcome.error) throw outcome.error;
    return outcome.result;
  }

  async function previewInvite(input, code) {
    return store.transaction(async (tx) => {
      const invite = await tx.get(inviteKey(code));
      const house = invite ? await openHousehold(tx, invite.household) : null;
      if (!house) fail(404, "That invite isn’t open anymore.");
      return house.dispatch(input);
    });
  }

  /**
   * Pairing up after signing up alone. The two of them are in separate households
   * until now, so the one with the code moves into the household that sent it.
   */
  async function acceptInvite(input, homeId) {
    const code = cleanCode(input.body?.code);
    return store.transaction(async (tx) => {
      const invite = code ? await tx.get(inviteKey(code)) : null;
      const home = await openHousehold(tx, homeId);
      if (!home) signedOut();
      if (!invite || invite.household === homeId) {
        const result = await home.dispatch(input);
        home.commit();
        return result;
      }
      const from = home.db();
      const session = (from.sessions || []).find((item) => item.token === input.token);
      const mover = session ? (from.users || []).find((user) => user.id === session.userId) : null;
      if (!mover) signedOut();
      if (from.pair || from.users.length !== 1) fail(409, "You two are already paired.");
      const token = `${invite.household}.${randomBytes(24).toString("hex")}`;
      const host = await openHousehold(tx, invite.household, {
        prepare(db) {
          db.users.push(mover);
          db.sessions.push({ token, userId: mover.id, createdAt: new Date(now()).toISOString() });
          for (const goal of from.goals || []) {
            if (goal.goalKey === "custom" || !db.goals.some((item) => item.goalKey === goal.goalKey)) db.goals.push(goal);
          }
          db.rewards.push(...(from.rewards || []));
          db.checkins.push(...(from.checkins || []));
        },
      });
      if (!host) fail(404, "That code isn’t open. Check it with your partner.");
      const result = await host.dispatch({ ...input, token, body: { ...input.body, code } });
      host.commit();
      for (const stale of openInviteCodes(from)) tx.delete(inviteKey(stale));
      tx.delete(householdKey(homeId));
      tx.set(emailKey(mover.email), { household: invite.household });
      // The old token named the household that was just folded away.
      return { ...result, body: { ...result.body, token } };
    });
  }

  async function photo(token, householdId, photoId) {
    if (!PHOTO_ID.test(photoId)) fail(404, "Can’t find that photo.");
    return store.transaction(async (tx) => {
      const saved = await tx.get(householdKey(householdId));
      if (!saved || !(saved.sessions || []).some((item) => item.token === token)) signedOut();
      const found = await tx.get(photoKey(householdId, photoId));
      if (!found) fail(404, "Can’t find that photo.");
      return { status: 200, body: { data: found.data } };
    });
  }

  async function dispatch(input) {
    const method = String(input.method || "GET").toUpperCase();
    const parsed = new URL(input.url || "/", "http://127.0.0.1");
    const parts = parsed.pathname.split("/").filter(Boolean);
    const route = `${method} /${parts.join("/")}`;

    if (route === "GET /api/health") {
      return { status: 200, body: { ok: true, demo: false, hosted: true, testerCode: Boolean(testerCode) } };
    }
    if (route === "GET /api/meta") {
      return createSlashApp({ hosted: true, store: { read: emptyDb, write() {} } }).dispatch(input);
    }
    if (route === "POST /api/household/reset" || route === "POST /api/demo/login") {
      fail(404, "There’s no demo pair here. Sign up, or sign in.");
    }
    if (route === "POST /api/auth/register") return register(input);
    if (route === "POST /api/auth/login") return login(input);
    if (route === "GET /api/invites/preview") return previewInvite(input, cleanCode(parsed.searchParams.get("code")));

    const householdId = householdOfToken(input.token);
    if (!householdId) signedOut();
    if (route === "POST /api/invites/accept") return acceptInvite(input, householdId);
    if (method === "GET" && parts[0] === "api" && parts[1] === "photos" && parts[2] && !parts[3]) {
      return photo(input.token, householdId, parts[2]);
    }
    return store.transaction(async (tx) => {
      const house = await openHousehold(tx, householdId);
      if (!house) signedOut();
      const result = await house.dispatch(input);
      house.commit();
      return result;
    });
  }

  /** For a plain Node server. A Firebase function already has the body parsed and calls dispatch itself. */
  async function handle(req, res) {
    try {
      const body = await readBody(req);
      const header = String(req.headers.authorization || "");
      const result = await dispatch({
        method: req.method || "GET",
        url: req.url || "/",
        token: header.startsWith("Bearer ") ? header.slice(7) : "",
        body,
        clientDate: String(req.headers["x-client-date"] || ""),
      });
      sendJson(res, result.status, result.body);
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.status ? error.message : "Something went wrong." });
    }
  }

  return { dispatch, handle };
}

/**
 * Keeps everything in memory, with the same rules a Firestore transaction has:
 * nothing is saved unless the whole function finishes, and reads come first.
 */
export function createMemoryStore(initial = {}) {
  const records = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  let queue = Promise.resolve();
  return {
    records,
    keys: () => [...records.keys()].sort(),
    read: (key) => (records.has(key) ? JSON.parse(records.get(key)) : null),
    transaction(run) {
      const next = queue.then(async () => {
        const writes = [];
        const result = await run({
          async get(key) {
            if (writes.length) throw new Error(`Read of ${key} after a write in the same transaction.`);
            return records.has(key) ? JSON.parse(records.get(key)) : null;
          },
          set(key, value) {
            writes.push([key, JSON.stringify(value)]);
          },
          delete(key) {
            writes.push([key, null]);
          },
        });
        for (const [key, value] of writes) {
          if (value === null) records.delete(key);
          else records.set(key, value);
        }
        return result;
      });
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
