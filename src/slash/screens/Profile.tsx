import { useState } from "react";
import { EXPERIENCE, MARKS, identityLine } from "../format.ts";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import { Avatar, Chip, Field, PageHead, Shell } from "../ui.tsx";

export function Profile() {
  const { data, request, logout, loginDemo } = useSession();
  const me = data!.me;
  const [name, setName] = useState(me.displayName);
  const [gender, setGender] = useState(me.gender);
  const [role, setRole] = useState(me.roleTitle);
  const [supplies, setSupplies] = useState(me.supplies.join(", "));
  const [experience, setExperience] = useState(me.experienceLevel);
  const [guideId, setGuideId] = useState(me.guideId);
  const [hue, setHue] = useState(me.avatar.hue);
  const [mark, setMark] = useState(me.avatar.mark);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    try {
      await request("/api/profile", {
        method: "PATCH",
        body: {
          displayName: name,
          gender,
          roleTitle: role,
          supplies: supplies.split(",").map((item) => item.trim()).filter(Boolean),
          experienceLevel: experience,
          guideId,
          avatar: { hue, mark },
        },
      });
      setSaved(true);
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="Profile" kicker={identityLine(me)} />
        <div className="center">
          <Avatar person={{ displayName: name || me.displayName, avatar: { hue, mark } }} size={84} />
        </div>
        <form className="stack" onSubmit={(event) => void save(event)}>
          <Field label="Name">
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Gender">
            <input value={gender} onChange={(event) => setGender(event.target.value)} />
          </Field>
          <Field label="Role title">
            <input value={role} onChange={(event) => setRole(event.target.value)} />
          </Field>
          <p className="fine">Pronouns in use: {me.pronouns?.label}. Subject “{me.pronouns?.subject}”, object “{me.pronouns?.object}”, possessive “{me.pronouns?.possessive}”.</p>
          <Field label="Self-care you have, separated by commas">
            <textarea value={supplies} rows={3} onChange={(event) => setSupplies(event.target.value)} />
          </Field>
          <p className="eyebrow">Experience for intimate tasks</p>
          <div className="chips">
            {EXPERIENCE.map((item) => (
              <Chip key={item.id} pressed={experience === item.id} onClick={() => setExperience(item.id)}>
                {item.label}
              </Chip>
            ))}
          </div>
          <p className="eyebrow">Guide</p>
          <div className="chips">
            {data!.meta.guides.map((guide) => (
              <Chip key={guide.id} pressed={guideId === guide.id} onClick={() => setGuideId(guide.id)}>
                {guide.name}
              </Chip>
            ))}
          </div>
          <Field label="Avatar color">
            <input type="range" min={0} max={360} value={hue} onChange={(event) => setHue(Number(event.target.value))} />
          </Field>
          <div className="chips">
            {MARKS.map((item) => (
              <Chip key={item} pressed={mark === item} onClick={() => setMark(item)}>{item}</Chip>
            ))}
          </div>
          <button className="primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
          {saved ? <p className="fine">Saved.</p> : null}
        </form>
        {data!.demo ? (
          <div className="card stack">
            <h2>Demo pair</h2>
            <p>Switch sides without a second account. Rowan is leading. Avery is following.</p>
            <button className="ghost" type="button" onClick={() => void loginDemo(me.slashSide === "leading" ? "following" : "leading").then(() => go("/home"))}>
              Switch to {me.slashSide === "leading" ? "Avery" : "Rowan"}
            </button>
          </div>
        ) : null}
        <button className="texty" type="button" onClick={() => void logout()}>Sign out</button>
      </div>
    </Shell>
  );
}
