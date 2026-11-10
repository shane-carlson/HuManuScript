import { useState } from "react";
import { identityLine, sideWord } from "../format.ts";
import { siteUrl } from "../api.ts";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import { Avatar, Field, PageHead, Shell } from "../ui.tsx";

export function Pair() {
  const { data, request } = useSession();
  const bundle = data!;
  const [channel, setChannel] = useState<"email" | "text">("email");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState(bundle.invites[0]?.code || "");
  const [join, setJoin] = useState("");
  const [pending, setPending] = useState(false);
  const link = code ? `${siteUrl()}/?invite=${code}` : "";

  async function createInvite(next: "email" | "text" | "link") {
    setPending(true);
    try {
      const payload = await request("/api/invites", { method: "POST", body: { channel: next === "link" ? "link" : next, contact } });
      const fresh = payload.invite?.code || payload.invites[0]?.code || "";
      setCode(fresh);
      if (fresh && next !== "link") openDraft(next, contact, fresh);
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  async function accept(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await request("/api/invites/accept", { method: "POST", body: { code: join } });
      go("/home");
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* The link stays on screen. */
    }
  }

  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="The two of you" kicker="Room for two, no more" />
        <div className="pair">
          <PersonCard name={bundle.me.displayName} line={`${sideWord(bundle.me.slashSide)} · ${identityLine(bundle.me)}`} hue={bundle.me.avatar.hue} mark={bundle.me.avatar.mark} />
          <span className="slash-mark" aria-hidden="true">/</span>
          {bundle.partner ? (
            <PersonCard name={bundle.partner.displayName} line={`${sideWord(bundle.partner.slashSide)} · ${identityLine(bundle.partner)}`} hue={bundle.partner.avatar.hue} mark={bundle.partner.avatar.mark} />
          ) : (
            <div className="card slim center">
              <p>Saving a seat for your partner.</p>
            </div>
          )}
        </div>

        {!bundle.partner && bundle.me.onboardingComplete ? (
          <section className="card stack">
            <h2>Send an invite</h2>
            <p>The link opens SlashConnect with your code filled in.{bundle.hosted ? "" : " Heads up: this build lives on this computer, so the link only works for someone who can reach it from here."}</p>
            <div className="chips">
              <button type="button" className={channel === "email" ? "chip on" : "chip"} onClick={() => setChannel("email")}>Email</button>
              <button type="button" className={channel === "text" ? "chip on" : "chip"} onClick={() => setChannel("text")}>Text</button>
            </div>
            <Field label={channel === "email" ? "Their email" : "Their phone number"}>
              <input value={contact} onChange={(event) => setContact(event.target.value)} inputMode={channel === "email" ? "email" : "tel"} />
            </Field>
            <button className="primary" type="button" disabled={pending} onClick={() => void createInvite(channel)}>
              {channel === "email" ? "Draft an email" : "Draft a text"}
            </button>
            <button className="ghost" type="button" disabled={pending} onClick={() => void createInvite("link")}>
              Just give me a link
            </button>
            {link ? (
              <>
                <p className="code">{code}</p>
                <input readOnly value={link} />
                <button className="ghost" type="button" onClick={() => void copy()}>Copy link</button>
              </>
            ) : null}
          </section>
        ) : null}

        {!bundle.partner ? (
          <form className="card stack" onSubmit={(event) => void accept(event)}>
            <h2>Got a code?</h2>
            <Field label="Invite code">
              <input value={join} onChange={(event) => setJoin(event.target.value.toUpperCase())} />
            </Field>
            <button className="primary" type="submit" disabled={pending || join.length < 4}>Pair up</button>
          </form>
        ) : (
          <p className="fine">You two are paired. There’s no room for a third.</p>
        )}
        {bundle.demo ? <p className="fine">This is the demo pair. Switch sides from your profile, or start your own from the welcome screen.</p> : null}
      </div>
    </Shell>
  );
}

function PersonCard({ name, line, hue, mark }: { name: string; line: string; hue: number; mark: string }) {
  return (
    <article className="card slim center">
      <Avatar person={{ displayName: name, avatar: { hue, mark } }} />
      <strong>{name}</strong>
      <p className="fine">{line}</p>
    </article>
  );
}

function openDraft(channel: "email" | "text", contact: string, code: string) {
  const link = `${siteUrl()}/?invite=${code}`;
  const text = `Come join me on SlashConnect. Sign up (18+ only), then use this code to pair with me: ${code}. ${link}`;
  const href = channel === "email"
    ? `mailto:${encodeURIComponent(contact)}?subject=${encodeURIComponent("Come join me on SlashConnect")}&body=${encodeURIComponent(text)}`
    : `sms:${contact.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.rel = "noreferrer";
  anchor.click();
}
