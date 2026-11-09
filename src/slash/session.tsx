import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./api.ts";
import type { Bundle } from "./types.ts";

const TOKEN_KEY = "slashconnect.token";

type Celebration = NonNullable<Bundle["celebration"]>;

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
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const tokenRef = useRef(token);

  const apply = useCallback((payload: Bundle) => {
    if (payload.token) {
      tokenRef.current = payload.token;
      localStorage.setItem(TOKEN_KEY, payload.token);
      setToken(payload.token);
    }
    if (payload.me) setData(payload);
    if (payload.celebration) setCelebration(payload.celebration);
  }, []);

  const request = useCallback(async (path: string, opts?: { method?: string; body?: unknown }) => {
    try {
      const payload = await api(path, { ...opts, token: tokenRef.current });
      apply(payload);
      setError("");
      return payload;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
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
          setError(caught instanceof Error ? caught.message : "Something went wrong.");
        }
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [token]);

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
    setCelebration(null);
    window.location.hash = "/";
  }, []);

  const value = useMemo<SessionValue>(() => ({
    token,
    data,
    loading,
    error,
    celebration,
    clearError: () => setError(""),
    clearCelebration: () => setCelebration(null),
    setError,
    request,
    loginDemo,
    logout,
  }), [token, data, loading, error, celebration, request, loginDemo, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SlashConnect session is missing.");
  return value;
}
