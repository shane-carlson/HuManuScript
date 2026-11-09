import { useEffect, useState } from "react";
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
  const [form, setForm] = useState({ name: "", email: "", password: "", code: invite });

  useEffect(() => {
    if (!invite) return;
    let cancel = false;
    fetch(`/api/invites/preview?code=${encodeURIComponent(invite)}`)
      .then((response) => response.json())
      .then((body: { fromName?: string; roleTitle?: string; pronouns?: string; error?: string }) => {
        if (cancel || body.error || !body.fromName) return;
        const bits = [body.roleTitle, body.pronouns].filter(Boolean).join(" · ");
        setPreview(`${body.fromName}${bits ? ` · ${bits}` : ""} invited you.`);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [invite]);

  async function enterDemo(who: "leading" | "following") {
    if (!adult) {
      setError("Confirm that you are 18 or older.");
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
      setError("Confirm that you are 18 or older.");
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
      setError("Confirm that you are 18 or older.");
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
        <p className="eyebrow">For two adults</p>
        <h1>SlashConnect</h1>
        <p className="lead">A private place to keep promises, notice each other, and let a long-distance dynamic feel tended.</p>
        {preview ? <p className="invite-banner">{preview}</p> : null}
        <label className="adult">
          <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} />
          <span>I confirm I am 18 or older. Role names in this app, including Little, are adult identities.</span>
        </label>

        {mode === "home" ? (
          <div className="stack">
            <button className="primary" type="button" onClick={() => setMode("register")}>
              Create an account
            </button>
            <button className="ghost" type="button" onClick={() => setMode("login")}>
              Sign in
            </button>
            <div className="demo-block">
              <p className="eyebrow">Try the demo pair</p>
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
              <p className="fine">Same computer, two sides. Demo password is <code>together</code> if you would rather sign in.</p>
            </div>
            {resetting ? (
              <div className="card warn-card">
                <p>This clears the demo household on this computer so two people can register and connect.</p>
                <button className="primary" type="button" disabled={pending} onClick={() => void startFresh()}>
                  Clear the demo and start
                </button>
                <button className="ghost" type="button" onClick={() => setResetting(false)}>
                  Keep the demo
                </button>
              </div>
            ) : (
              <button className="texty" type="button" onClick={() => setResetting(true)}>
                Start your own connection
              </button>
            )}
          </div>
        ) : null}

        {mode === "register" ? (
          <form className="stack" onSubmit={(event) => void register(event)}>
            <Field label="Name your partner will see">
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="nickname" required />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
            </Field>
            <Field label="Password">
              <input type="password" value={form.password} minLength={6} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" required />
            </Field>
            <Field label="Invite code, if you have one">
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} autoCapitalize="characters" />
            </Field>
            <button className="primary" type="submit" disabled={pending}>
              {pending ? "Creating…" : "Continue"}
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
            <Field label="Invite code, if you are joining">
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
