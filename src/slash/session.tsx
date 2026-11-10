import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, askServer, rememberedServer, sendIdTokens, type ServerInfo } from "./api.ts";
import { authCode, authMessage, firebaseAuth, firebaseConfigured, wrongPassword } from "./firebase.ts";
import type { Bundle } from "./types.ts";

const TOKEN_KEY = "slashconnect.token";

type Celebration = NonNullable<Bundle["celebration"]> & { key: string; from?: string };

const REFRESH_MS = 20000;
const ASK_AGAIN_MS = 4000;
const NOT_CONNECTED = "This build isn’t connected to Firebase yet, so nobody can sign in.";

type SignUp = { displayName: string; email: string; password: string; inviteCode?: string; testerCode?: string };
type SignIn = { email: string; password: string };
type Firebase = Awaited<ReturnType<typeof firebaseAuth>>;

type SessionValue = {
  /**
   * Set while someone is signed in. On this computer it is the server's session
   * token; on a hosted server it is the Firebase uid, and each request carries
   * a fresh Firebase ID token instead.
   */
  token: string | null;
  data: Bundle | null;
  loading: boolean;
  /** True until the app knows what kind of server it has and whether anyone is signed in. */
  starting: boolean;
  /** What kind of server this is, once it has answered. */
  server: ServerInfo | null;
  error: string;
  celebration: Celebration | null;
  clearError: () => void;
  clearCelebration: () => void;
  setError: (message: string) => void;
  request: (path: string, opts?: { method?: string; body?: unknown }) => Promise<Bundle>;
  signUp: (input: SignUp) => Promise<Bundle>;
  signIn: (input: SignIn) => Promise<Bundle>;
  /** Hosted only: has Firebase email a password reset link. Says nothing about whether the address is known. */
  forgotPassword: (email: string) => Promise<void>;
  loginDemo: (who: "leading" | "following") => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState("");
  const [own, setOwn] = useState<Celebration | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const tokenRef = useRef(token);
  const serverRef = useRef(server);
  // True while a hosted sign-up or sign-in is part way through, so the Firebase
  // listener leaves the session alone until there is a person to show.
  const busy = useRef(false);
  const shown = useRef(0);
  const writes = useRef(0);

  const hosted = server?.hosted === true;
  const authEmulator = server?.authEmulator || "";
  // Hosted, and able to reach Firebase Authentication: the real project once its web app is registered, or the emulator.
  const connected = hosted && (firebaseConfigured || authEmulator !== "");
  const starting = server === null || (connected && !authReady);

  /**
   * Who a hosted server has signed in, or null for nobody on either kind of
   * server. The uid is kept so the next start can tell there is a session to
   * wait for; it is never what proves who is asking.
   */
  const signedInAs = useCallback((who: string | null) => {
    tokenRef.current = who;
    setToken(who);
    if (who) {
      localStorage.setItem(TOKEN_KEY, who);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setData(null);
      setOwn(null);
    }
  }, []);

  const firebase = useCallback(async (): Promise<Firebase> => {
    const known = serverRef.current;
    if (!known?.hosted || !(firebaseConfigured || known.authEmulator)) throw new ApiError(0, NOT_CONNECTED);
    try {
      return await firebaseAuth(known.authEmulator);
    } catch {
      throw new ApiError(0, "Can’t reach SlashConnect right now. Check your connection and try again.");
    }
  }, []);

  /** Ends the session here. On a hosted server that means signing out of Firebase too. */
  const dropSession = useCallback(() => {
    signedInAs(null);
    if (!serverRef.current?.hosted) return;
    firebase()
      .then(({ auth, sdk }) => sdk.signOut(auth))
      .catch(() => undefined);
  }, [firebase, signedInAs]);

  useEffect(() => {
    let cancel = false;
    let again = 0;
    const settle = (info: ServerInfo) => {
      const guess = serverRef.current;
      // Firebase can only be set up once. If a guess made without a connection
      // picked the wrong one, start over with what the server really said.
      if (guess?.hosted && info.hosted && guess.authEmulator !== info.authEmulator) {
        window.location.reload();
        return;
      }
      // With no Firebase to ask, nobody is signed in, whatever was kept from before.
      if (info.hosted && !firebaseConfigured && !info.authEmulator) signedInAs(null);
      serverRef.current = info;
      setServer(info);
    };
    const ask = () => {
      askServer()
        .then((info) => {
          if (!cancel) settle(info);
        })
        .catch(() => {
          if (cancel) return;
          if (!serverRef.current) settle(rememberedServer());
          again = window.setTimeout(ask, ASK_AGAIN_MS);
        });
    };
    ask();
    return () => {
      cancel = true;
      window.clearTimeout(again);
    };
  }, [signedInAs]);

  useEffect(() => {
    if (!connected) return;
    let cancel = false;
    let stop = () => {};
    firebaseAuth(authEmulator)
      .then(({ auth, sdk }) => {
        if (cancel) return;
        sendIdTokens(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null));
        stop = sdk.onAuthStateChanged(auth, () => {
          setAuthReady(true);
          // Read now rather than from the event: a sign-up that failed has already signed back out.
          if (!busy.current) signedInAs(auth.currentUser ? auth.currentUser.uid : null);
        });
      })
      .catch(() => {
        if (cancel) return;
        setAuthReady(true);
        setError("Can’t reach SlashConnect right now. Check your connection and try again.");
      });
    return () => {
      cancel = true;
      stop();
    };
  }, [connected, authEmulator, signedInAs]);

  const apply = useCallback((payload: Bundle) => {
    if (payload.token) {
      tokenRef.current = payload.token;
      localStorage.setItem(TOKEN_KEY, payload.token);
      setToken(payload.token);
    }
    if (payload.me) setData(payload);
    if (payload.celebration) {
      shown.current += 1;
      setOwn({ ...payload.celebration, key: `own-${shown.current}` });
    }
  }, []);

  const request = useCallback(async (path: string, opts?: { method?: string; body?: unknown }) => {
    writes.current += 1;
    try {
      const payload = await api(path, { ...opts, token: tokenRef.current });
      writes.current += 1;
      apply(payload);
      setError("");
      return payload;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "That didn’t work. Try again?";
      if (caught instanceof ApiError && caught.status === 401) dropSession();
      setError(message);
      throw caught;
    }
  }, [apply, dropSession]);

  useEffect(() => {
    if (starting) return;
    if (!token) {
      setLoading(false);
      setData(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    api("/api/session", { token })
      .then((payload) => {
        if (cancel) return;
        setData(payload);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (cancel) return;
        // "no-profile" is a Firebase sign-in whose sign-up here never finished. Signing up again picks it up.
        if (caught instanceof ApiError && (caught.status === 401 || caught.code === "no-profile")) {
          dropSession();
        } else {
          setError(caught instanceof Error ? caught.message : "That didn’t work. Try again?");
        }
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [token, starting, dropSession]);

  // The other person changes things too: a well done, a new task, a granted reward.
  useEffect(() => {
    if (!token || starting) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const before = writes.current;
      api("/api/session", { token })
        .then((payload) => {
          if (writes.current === before && tokenRef.current === token) setData(payload);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [token, starting]);

  const celebration = useMemo<Celebration | null>(() => {
    if (own) return own;
    const cheer = data?.cheer;
    if (!cheer || cheer.ids.every((id) => seen.includes(id))) return null;
    return { ...cheer, key: `cheer-${cheer.ids.join(" ")}` };
  }, [own, data, seen]);

  const clearCelebration = useCallback(() => {
    if (own) {
      setOwn(null);
      return;
    }
    const ids = data?.cheer?.ids;
    if (!ids) return;
    // Hidden at once here; the server forgets it once it hears back, so a dropped call shows it again later.
    setSeen((list) => [...list, ...ids].slice(-60));
    writes.current += 1;
    api("/api/cheers/seen", { method: "POST", body: { ids }, token: tokenRef.current })
      .then((payload) => {
        writes.current += 1;
        setData(payload);
      })
      .catch(() => undefined);
  }, [own, data]);

  /**
   * Runs one hosted sign-up or sign-in from Firebase through to a person on
   * screen. If it stops anywhere short of that, Firebase is signed back out, so
   * the app is never left signed in to an account with nothing behind it.
   */
  const withFirebase = useCallback(async (run: (tools: Firebase) => Promise<Bundle>) => {
    busy.current = true;
    let tools: Firebase | null = null;
    let landed = false;
    try {
      tools = await firebase();
      const payload = await run(tools);
      writes.current += 1;
      apply(payload);
      signedInAs(tools.auth.currentUser ? tools.auth.currentUser.uid : null);
      landed = true;
      setError("");
      return payload;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : authMessage(caught));
      throw caught;
    } finally {
      if (tools && !landed && tools.auth.currentUser) await tools.sdk.signOut(tools.auth).catch(() => undefined);
      busy.current = false;
    }
  }, [apply, firebase, signedInAs]);

  const signUp = useCallback(async (input: SignUp) => {
    const body = {
      displayName: input.displayName,
      adultConfirmed: true,
      inviteCode: input.inviteCode || undefined,
      testerCode: input.testerCode || undefined,
    };
    if (!serverRef.current?.hosted) {
      return request("/api/auth/register", { method: "POST", body: { ...body, email: input.email, password: input.password } });
    }
    return withFirebase(async ({ auth, sdk }) => {
      // Asked first, so a wrong tester code or a used invite never leaves a Firebase account behind.
      await api("/api/auth/check", { method: "POST", body });
      try {
        await sdk.createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
      } catch (caught) {
        if (authCode(caught) !== "auth/email-already-in-use") throw caught;
        // Perhaps their own sign-up that stopped half way. The same password lets them finish it.
        await sdk.signInWithEmailAndPassword(auth, input.email.trim(), input.password).catch((second: unknown) => {
          // Someone else’s address, or a different password: all they need to hear is that it is taken.
          throw wrongPassword(second) ? caught : second;
        });
        try {
          return await api("/api/session");
        } catch (missing) {
          if (!(missing instanceof ApiError) || missing.code !== "no-profile") throw missing;
        }
      }
      return api("/api/auth/register", { method: "POST", body });
    });
  }, [request, withFirebase]);

  const signIn = useCallback(async (input: SignIn) => {
    if (!serverRef.current?.hosted) {
      return request("/api/auth/login", { method: "POST", body: { email: input.email, password: input.password } });
    }
    return withFirebase(async ({ auth, sdk }) => {
      await sdk.signInWithEmailAndPassword(auth, input.email.trim(), input.password);
      return api("/api/session");
    });
  }, [request, withFirebase]);

  const forgotPassword = useCallback(async (email: string) => {
    try {
      const { auth, sdk } = await firebase();
      await sdk.sendPasswordResetEmail(auth, email.trim());
    } catch (caught) {
      // Whether an address has an account is nobody else’s business, so an unknown one looks the same as a known one.
      if (authCode(caught) === "auth/user-not-found") return;
      setError(caught instanceof ApiError ? caught.message : authMessage(caught));
      throw caught;
    }
  }, [firebase]);

  const loginDemo = useCallback(async (who: "leading" | "following") => {
    const payload = await request("/api/demo/login", { method: "POST", body: { who } });
    apply(payload);
  }, [apply, request]);

  const logout = useCallback(async () => {
    try {
      if (serverRef.current?.hosted) {
        const { auth, sdk } = await firebase();
        await sdk.signOut(auth);
      } else if (tokenRef.current) {
        await api("/api/auth/logout", { method: "POST", token: tokenRef.current });
      }
    } catch {
      /* Signing out here still stands. The household is kept wherever it lives. */
    }
    signedInAs(null);
    window.location.hash = "/";
  }, [firebase, signedInAs]);

  const value = useMemo<SessionValue>(() => ({
    token,
    data,
    loading,
    starting,
    server,
    error,
    celebration,
    clearError: () => setError(""),
    clearCelebration,
    setError,
    request,
    signUp,
    signIn,
    forgotPassword,
    loginDemo,
    logout,
  }), [token, data, loading, starting, server, error, celebration, clearCelebration, request, signUp, signIn, forgotPassword, loginDemo, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SlashConnect session is missing.");
  return value;
}
