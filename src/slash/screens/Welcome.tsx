import { useEffect, useState } from "react";
import { remoteServer, serverUrl } from "../api.ts";
import { Mark } from "../guides.tsx";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import { Avatar, Field, Shell } from "../ui.tsx";

const DEMO = {
  leading: {
    displayName: "Rowan Hale",
    avatar: { hue: 350, mark: "moon" },
    line: "Leading · Domme · she/her · woman",
  },
  following: {
    displayName: "Avery Quinn",
    avatar: { hue: 262, mark: "star" },
    line: "Following · Little · they/them · nonbinary",
  },
} as const;

export function Welcome() {
  const { loginDemo, request, setError } = useSession();
  const [adult, setAdult] = useState(false);
  const [mode, setMode] = useState<"home" | "register" | "login">("home");
  const [pending, setPending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [invite, setInvite] = useState(() => inviteFromLocation());
  const [preview, setPreview] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", code: invite, tester: "" });
  // A hosted server has no demo pair, and may ask new people for a tester code.
  const [server, setServer] = useState<{ hosted: boolean; testerCode: boolean } | null>(null);

  useEffect(() => {
    let cancel = false;
    let again = 0;
    const ask = () => {
      fetch(serverUrl("/api/health"))
        .then((response) => response.json())
        .then((body: { hosted?: boolean; testerCode?: boolean }) => {
          if (!cancel) setServer({ hosted: remoteServer || body.hosted === true, testerCode: body.testerCode === true });
        })
        .catch(() => {
          if (cancel) return;
          // The phone apps have no demo pair to fall back on, so they keep asking.
          setServer({ hosted: remoteServer, testerCode: false });
          if (remoteServer) again = window.setTimeout(ask, 4000);
        });
    };
    ask();
    return () => {
      cancel = true;
      window.clearTimeout(again);
    };
  }, []);

  useEffect(() => {
    if (!invite) return;
    let cancel = false;
    fetch(serverUrl(`/api/invites/preview?code=${encodeURIComponent(invite)}`))
      .then((response) => response.json())
      .then((body: { fromName?: string; roleTitle?: string; pronouns?: string; error?: string }) => {
        if (cancel || body.error || !body.fromName) return;
        const bits = [body.roleTitle, body.pronouns].filter(Boolean).join(" · ");
        setPreview(`${body.fromName}${bits ? ` · ${bits}` : ""} is waiting for you.`);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [invite]);

  async function enterDemo(who: "leading" | "following") {
    if (!adult) {
      setError("Tick the 18 or older box first.");
      return;
    }
    setPending(true);
    try {
      await loginDemo(who);
      go("/home");
    } catch {
      /* Session surfaces the message. */
    } finally {
      setPending(false);
    }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (!adult) {
      setError("Tick the 18 or older box first.");
      return;
    }
    setPending(true);
    try {
      await request("/api/auth/register", {
        method: "POST",
        body: {
          displayName: form.name,
          email: form.email,
          password: form.password,
          adultConfirmed: true,
          inviteCode: form.code || undefined,
          testerCode: form.tester || undefined,
        },
      });
      sessionStorage.removeItem("slash.invite");
      go("/setup");
    } catch {
      /* shown in the toast */
    } finally {
      setPending(false);
    }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!adult) {
      setError("Tick the 18 or older box first.");
      return;
    }
    setPending(true);
    try {
      const payload = await request("/api/auth/login", {
        method: "POST",
        body: { email: form.email, password: form.password },
      });
      if (form.code && !payload.pair) {
        try {
          await request("/api/invites/accept", { method: "POST", body: { code: form.code } });
        } catch {
          /* They can finish setup and try the code from the pair screen. */
        }
      }
      go(payload.me.onboardingComplete ? "/home" : "/setup");
    } catch {
      /* shown in the toast */
    } finally {
      setPending(false);
    }
  }

  async function startFresh() {
    setPending(true);
    try {
      await request("/api/household/reset", { method: "POST", body: { confirm: "reset-demo" } });
      setResetting(false);
      setMode("register");
      setInvite("");
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <div className="welcome">
        <Mark className="mark hero-mark" />
        <p className="eyebrow">Just the two of you</p>
        <h1>SlashConnect</h1>
        <p className="lead">A private little corner for your dynamic. Tasks, praise, rewards, and check-ins for when you’re miles apart.</p>
        {preview ? <p className="invite-banner">{preview}</p> : null}
        <label className="adult">
          <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} />
          <span>I’m 18 or older. Everyone here is an adult, and role names like Little are adult roles.</span>
        </label>

        {mode === "home" ? (
          <div className="stack">
            <button className="primary" type="button" onClick={() => setMode("register")}>
              Sign up
            </button>
            <button className="ghost" type="button" onClick={() => setMode("login")}>
              Sign in
            </button>
            {server && !server.hosted ? (
            <>
            <div className="demo-block">
              <p className="eyebrow">Or try it as the demo pair</p>
              <button className="demo-card" type="button" disabled={pending} onClick={() => void enterDemo("leading")}>
                <Avatar person={DEMO.leading} />
                <span>
                  <strong>{DEMO.leading.displayName}</strong>
                  <em>{DEMO.leading.line}</em>
                </span>
              </button>
              <button className="demo-card" type="button" disabled={pending} onClick={() => void enterDemo("following")}>
                <Avatar person={DEMO.following} />
                <span>
                  <strong>{DEMO.following.displayName}</strong>
                  <em>{DEMO.following.line}</em>
                </span>
              </button>
              <p className="fine">Two sides, one computer. If you’d rather sign in, the demo password is <code>together</code>.</p>
            </div>
            {resetting ? (
              <div className="card warn-card">
                <p>This wipes the demo pair from this computer so the two of you can sign up for real.</p>
                <button className="primary" type="button" disabled={pending} onClick={() => void startFresh()}>
                  Wipe the demo and start
                </button>
                <button className="ghost" type="button" onClick={() => setResetting(false)}>
                  Keep the demo
                </button>
              </div>
            ) : (
              <button className="texty" type="button" onClick={() => setResetting(true)}>
                Start your own dynamic
              </button>
            )}
            </>
            ) : null}
          </div>
        ) : null}

        {mode === "register" ? (
          <form className="stack" onSubmit={(event) => void register(event)}>
            <Field label="The name your partner will see">
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="nickname" required />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
            </Field>
            <Field label="Password">
              <input type="password" value={form.password} minLength={6} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" required />
            </Field>
            <Field label="Got an invite code?">
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} autoCapitalize="characters" />
            </Field>
            {server?.testerCode && !form.code ? (
              <Field label="Tester code">
                <input value={form.tester} onChange={(event) => setForm({ ...form, tester: event.target.value })} autoCapitalize="none" autoCorrect="off" required />
                <em className="fine">From whoever asked you to try this. You don’t need one if your partner sent you an invite code.</em>
              </Field>
            ) : null}
            <button className="primary" type="submit" disabled={pending}>
              {pending ? "Setting you up…" : "Next"}
            </button>
            <button className="texty" type="button" onClick={() => setMode("home")}>
              Back
            </button>
          </form>
        ) : null}

        {mode === "login" ? (
          <form className="stack" onSubmit={(event) => void login(event)}>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
            </Field>
            <Field label="Password">
              <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="current-password" required />
            </Field>
            <Field label="Got an invite code?">
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} />
            </Field>
            <button className="primary" type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
            <button className="texty" type="button" onClick={() => setMode("home")}>
              Back
            </button>
          </form>
        ) : null}
      </div>
    </Shell>
  );
}

function inviteFromLocation() {
  const fromQuery = new URLSearchParams(window.location.search).get("invite");
  const stored = sessionStorage.getItem("slash.invite");
  const code = (fromQuery || stored || "").toUpperCase();
  if (code) sessionStorage.setItem("slash.invite", code);
  return code;
}
