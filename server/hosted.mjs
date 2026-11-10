import { randomBytes, timingSafeEqual } from "node:crypto";
import { createSlashApp, emptyDb, readBody, sendJson } from "./slashconnect.mjs";

/**
 * SlashConnect for many couples on one server.
 *
 * Each couple is one household record, and every request runs the same rules as
 * the single-computer build over just that record. Signing in is Firebase
 * Authentication's job: a request carries a Firebase ID token, `verifyToken`
 * says whose it is, and the rest of this file only ever sees that answer.
 * Around the households sit two small indexes, because a signed-in person and
 * an invite code each have to find their household before any of it is read:
 *
 *   households/<id>               the household, as the engine keeps it
 *   households/<id>/photos/<id>   one photo each, kept out of the household record
 *   accounts/<uid>                which household, and who in it, a Firebase account is
 *   invites/<code>                which household an open invite belongs to
 *
 * `store.transaction(fn)` must run `fn` atomically and may run it more than once.
 * Inside it every `get` has to come before the first `set` or `delete`, which is
 * the rule Firestore transactions have.
 */

const PHOTO_ID = /^[a-f0-9]{24}$/;
const PHOTO_REF = "photo:";
// A Firebase uid becomes part of a record's path, so only plain ones are let through.
const UID = /^[A-Za-z0-9_-]{1,128}$/;

function fail(status, error, code) {
  const err = new Error(error);
  err.status = status;
  if (code) err.code = code;
  throw err;
}

const newId = () => randomBytes(12).toString("hex");
const accountKey = (uid) => `accounts/${uid}`;
const inviteKey = (code) => `invites/${code}`;
const householdKey = (id) => `households/${id}`;
const photoKey = (householdId, photoId) => `households/${householdId}/photos/${photoId}`;
const cleanCode = (value) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

function sameText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function openInviteCodes(db) {
  return (db?.invites || []).filter((invite) => invite.status === "open").map((invite) => invite.code);
}

function signedOut() {
  fail(401, "You’ve been signed out. Sign back in.");
}

/** Signed in with Firebase, but never finished signing up here. The app listens for this code. */
function notSetUp() {
  fail(404, "You started signing up but didn’t finish. Add your name to pick up where you left off.", "no-profile");
}

export function createHostedApp(options = {}) {
  const store = options.store;
  if (!store) throw new Error("A hosted SlashConnect needs somewhere to keep its households.");
  const verifyToken = options.verifyToken;
  if (typeof verifyToken !== "function") throw new Error("A hosted SlashConnect needs a way to check who is signed in.");
  const testerCode = String(options.testerCode || "").trim();
  const authEmulator = String(options.authEmulator || "").trim();

  /**
   * Whose request this is. `verifyToken` resolves to `{ uid, email, emailVerified }`
   * for a good Firebase ID token and to nothing for a bad one. If it throws, the
   * check itself broke, and that is a server error rather than a sign-out.
   */
  async function whoIs(token) {
    if (!token) signedOut();
    const found = await verifyToken(String(token));
    const uid = String(found?.uid || "");
    if (!UID.test(uid)) signedOut();
    return { uid, email: String(found.email || "").trim().toLowerCase(), emailVerified: found.emailVerified === true };
  }

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
      db: () => current,
      /** `actor` is who the engine should act as. It is only ever built in this file. */
      ask: (input, actor) => engine.dispatch({
        method: input.method,
        url: input.url,
        body: input.body,
        clientDate: input.clientDate,
        actor,
      }),
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

  /** The household a signed-in person lives in, or nothing if they have not signed up here yet. */
  async function openHome(tx, identity) {
    const account = await tx.get(accountKey(identity.uid));
    const house = account ? await openHousehold(tx, account.household) : null;
    const me = house ? house.db().users.find((user) => user.id === account.user) : null;
    return me ? { house, me, actor: { userId: me.id } } : null;
  }

  /** What a sign-up has to bring before anything is made for it. Returns its invite code, if any. */
  function entry(body) {
    if (body.adultConfirmed !== true) fail(400, "SlashConnect is 18 and over. Tick the box to confirm.");
    if (!String(body.displayName ?? "").trim()) fail(400, "Add the name you want your partner to see.");
    const code = cleanCode(body.inviteCode);
    if (testerCode && !code && !sameText(String(body.testerCode || "").trim().toLowerCase(), testerCode.toLowerCase())) {
      fail(403, "This test is invite only. Ask whoever sent you here for the tester code.");
    }
    return code;
  }

  /**
   * Asked before the app makes a Firebase account, so a wrong tester code or a
   * used-up invite never leaves an account behind with nowhere to go.
   */
  async function checkEntry(input) {
    const code = entry(input.body || {});
    if (code) {
      const invite = await store.transaction((tx) => tx.get(inviteKey(code)));
      if (!invite) fail(404, "That code isn’t open. Check it with your partner.");
    }
    return { status: 200, body: { ok: true } };
  }

  async function register(input, identity) {
    const body = input.body || {};
    const code = entry(body);
    if (!identity.email) fail(400, "That sign-in has no email address. Sign up with an email and a password.");
    return store.transaction(async (tx) => {
      const home = await openHome(tx, identity);
      if (home) {
        // Asked a second time, say after a dropped connection. They are already in.
        const result = await home.house.ask({ method: "GET", url: "/api/session", clientDate: input.clientDate }, home.actor);
        home.house.commit();
        return result;
      }
      let id = newId();
      if (code) {
        const invite = await tx.get(inviteKey(code));
        if (!invite) fail(404, "That code isn’t open. Check it with your partner.");
        id = invite.household;
      }
      const house = await openHousehold(tx, id, { create: !code });
      if (!house) fail(404, "That code isn’t open. Check it with your partner.");
      const result = await house.ask({ ...input, body: { ...body, inviteCode: code || undefined } }, { email: identity.email });
      house.commit();
      tx.set(accountKey(identity.uid), { household: id, user: result.body.me.id });
      return result;
    });
  }

  async function previewInvite(input, code) {
    return store.transaction(async (tx) => {
      const invite = await tx.get(inviteKey(code));
      const house = invite ? await openHousehold(tx, invite.household) : null;
      if (!house) fail(404, "That invite isn’t open anymore.");
      return house.ask(input);
    });
  }

  /**
   * Pairing up after signing up alone. The two of them are in separate households
   * until now, so the one with the code moves into the household that sent it.
   */
  async function acceptInvite(input, identity) {
    const code = cleanCode(input.body?.code);
    return store.transaction(async (tx) => {
      const home = await openHome(tx, identity);
      if (!home) notSetUp();
      const invite = code ? await tx.get(inviteKey(code)) : null;
      if (!invite || invite.household === home.house.id) {
        const result = await home.house.ask(input, home.actor);
        home.house.commit();
        return result;
      }
      const from = home.house.db();
      const mover = home.me;
      if (from.pair || from.users.length !== 1) fail(409, "You two are already paired.");
      const host = await openHousehold(tx, invite.household, {
        prepare(db) {
          db.users.push(mover);
          for (const goal of from.goals || []) {
            if (goal.goalKey === "custom" || !db.goals.some((item) => item.goalKey === goal.goalKey)) db.goals.push(goal);
          }
          db.rewards.push(...(from.rewards || []));
          db.checkins.push(...(from.checkins || []));
        },
      });
      if (!host) fail(404, "That code isn’t open. Check it with your partner.");
      const result = await host.ask({ ...input, body: { ...input.body, code } }, home.actor);
      host.commit();
      for (const stale of openInviteCodes(from)) tx.delete(inviteKey(stale));
      tx.delete(householdKey(home.house.id));
      tx.set(accountKey(identity.uid), { household: invite.household, user: mover.id });
      return result;
    });
  }

  async function photo(identity, photoId) {
    if (!PHOTO_ID.test(photoId)) fail(404, "Can’t find that photo.");
    return store.transaction(async (tx) => {
      const account = await tx.get(accountKey(identity.uid));
      const saved = account ? await tx.get(householdKey(account.household)) : null;
      if (!saved || !(saved.users || []).some((user) => user.id === account.user)) notSetUp();
      const found = await tx.get(photoKey(account.household, photoId));
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
      return {
        status: 200,
        body: { ok: true, demo: false, hosted: true, testerCode: Boolean(testerCode), ...(authEmulator ? { authEmulator } : {}) },
      };
    }
    if (route === "GET /api/meta") {
      return createSlashApp({ hosted: true, store: { read: emptyDb, write() {} } }).dispatch({ method, url: input.url, body: {} });
    }
    if (route === "POST /api/household/reset" || route === "POST /api/demo/login") {
      fail(404, "There’s no demo pair here. Sign up, or sign in.");
    }
    if (route === "POST /api/auth/login") {
      fail(410, "This copy of SlashConnect is out of date. Update it, then sign in again.");
    }
    if (route === "POST /api/auth/check") return checkEntry(input);
    if (route === "GET /api/invites/preview") return previewInvite(input, cleanCode(parsed.searchParams.get("code")));

    const identity = await whoIs(input.token);
    if (route === "POST /api/auth/register") return register(input, identity);
    // Firebase holds the sign-in, so there is nothing here to end.
    if (route === "POST /api/auth/logout") return { status: 200, body: { ok: true } };
    if (route === "POST /api/invites/accept") return acceptInvite(input, identity);
    if (method === "GET" && parts[0] === "api" && parts[1] === "photos" && parts[2] && !parts[3]) {
      return photo(identity, parts[2]);
    }
    return store.transaction(async (tx) => {
      const home = await openHome(tx, identity);
      if (!home) notSetUp();
      const result = await home.house.ask(input, home.actor);
      home.house.commit();
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
      sendJson(res, error.status || 500, errorBody(error));
    }
  }

  return { dispatch, handle };
}

/** What a failed request sends back. Anything without a status is ours, and is not described. */
export function errorBody(error) {
  if (!error.status) return { error: "Something went wrong." };
  return error.code ? { error: error.message, code: error.code, ...(error.feature ? { feature: error.feature } : {}) } : { error: error.message };
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
