import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./api.ts";
import type { Bundle } from "./types.ts";

const TOKEN_KEY = "slashconnect.token";

type Celebration = NonNullable<Bundle["celebration"]> & { key: string; from?: string };

const REFRESH_MS = 20000;

type SessionValue = {
  token: string | null;
  data: Bundle | null;
  loading: boolean;
  error: string;
  celebration: Celebration | null;
  clearError: () => void;
  clearCelebration: () => void;
  setError: (message: string) => void;
  request: (path: string, opts?: { method?: string; body?: unknown }) => Promise<Bundle>;
  loginDemo: (who: "leading" | "following") => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");
  const [own, setOwn] = useState<Celebration | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const tokenRef = useRef(token);
  const shown = useRef(0);
  const writes = useRef(0);

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
      if (caught instanceof ApiError && caught.status === 401) {
        tokenRef.current = null;
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setData(null);
      }
      setError(message);
      throw caught;
    }
  }, [apply]);

  useEffect(() => {
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
        if (caught instanceof ApiError && caught.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          tokenRef.current = null;
          setToken(null);
          setData(null);
        } else {
          setError(caught instanceof Error ? caught.message : "That didn’t work. Try again?");
        }
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  // The other person changes things too: a well done, a new task, a granted reward.
  useEffect(() => {
    if (!token) return;
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
  }, [token]);

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

  const loginDemo = useCallback(async (who: "leading" | "following") => {
    const payload = await request("/api/demo/login", { method: "POST", body: { who } });
    apply(payload);
  }, [apply, request]);

  const logout = useCallback(async () => {
    try {
      if (tokenRef.current) await api("/api/auth/logout", { method: "POST", token: tokenRef.current });
    } catch {
      /* Signing out locally still leaves the household on this computer. */
    }
    tokenRef.current = null;
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setData(null);
    setOwn(null);
    window.location.hash = "/";
  }, []);

  const value = useMemo<SessionValue>(() => ({
    token,
    data,
    loading,
    error,
    celebration,
    clearError: () => setError(""),
    clearCelebration,
    setError,
    request,
    loginDemo,
    logout,
  }), [token, data, loading, error, celebration, clearCelebration, request, loginDemo, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SlashConnect session is missing.");
  return value;
}
