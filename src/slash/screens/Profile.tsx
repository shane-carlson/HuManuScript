import { useState } from "react";
import { LookBuilder } from "../avatar/Builder.tsx";
import { AvatarFace } from "../avatar/Face.tsx";
import { hueOf, lookOf } from "../avatar/looks.ts";
import { EXPERIENCE, identityLine } from "../format.ts";
import { GuideFace } from "../guides.tsx";
import { go } from "../route.ts";
import { seedFrom } from "../seeded.ts";
import { useSession } from "../session.tsx";
import { StuffieMaker } from "../stuffie/Maker.tsx";
import { rollStuffie, soundStuffie } from "../stuffie/roll.ts";
import { Chip, Field, PageHead, Shell } from "../ui.tsx";

export function Profile() {
  const { data, request, logout, loginDemo } = useSession();
  const me = data!.me;
  const [name, setName] = useState(me.displayName);
  const [gender, setGender] = useState(me.gender);
  const [role, setRole] = useState(me.roleTitle);
  const [supplies, setSupplies] = useState(me.supplies.join(", "));
  const [experience, setExperience] = useState(me.experienceLevel);
  const [guideId, setGuideId] = useState(me.guideId);
  const [look, setLook] = useState(() => lookOf(me.avatar));
  const [dressing, setDressing] = useState(false);
  const [stuffie, setStuffie] = useState(() => soundStuffie(me.stuffie) || rollStuffie(seedFrom(`stuffie:${me.id}`)));
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const made = guideId === "custom";
  const nameless = made && !stuffie.name.trim();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (nameless) return;
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
          ...(made ? { stuffie: { ...stuffie, name: stuffie.name.trim() } } : {}),
          avatar: { hue: hueOf(look), mark: me.avatar?.mark || "heart", look },
        },
      });
      setSaved(true);
      setDressing(false);
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  const saveButton = (
    <button className="primary" type="submit" disabled={pending || nameless}>
      {pending ? "Saving…" : "Save"}
    </button>
  );

  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="You" kicker={identityLine(me)} />
        <form className="stack" onSubmit={(event) => void save(event)}>
          {/* Keyed apart so the tapped button is never reused as the Save button mid-click, which would submit the form. */}
          {dressing ? (
            <div className="stack" key="dressing">
              <LookBuilder look={look} onChange={setLook} />
              {saveButton}
              <button
                className="texty"
                type="button"
                onClick={() => {
                  setLook(lookOf(me.avatar));
                  setDressing(false);
                }}
              >
                Never mind
              </button>
            </div>
          ) : (
            <div className="look-edit" key="dressed">
              <AvatarFace look={look} size={104} className="look-big" />
              <button className="ghost tiny" type="button" onClick={() => setDressing(true)}>
                Change your look
              </button>
            </div>
          )}
          <Field label="Name">
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Gender">
            <input value={gender} onChange={(event) => setGender(event.target.value)} />
          </Field>
          <Field label="Your title">
            <input value={role} onChange={(event) => setRole(event.target.value)} />
          </Field>
          <p className="fine">Your pronouns: {me.pronouns?.label}.</p>
          <Field label="Your self-care stash (commas between)">
            <textarea value={supplies} rows={3} onChange={(event) => setSupplies(event.target.value)} />
          </Field>
          <p className="eyebrow">Experience with spicy tasks</p>
          <div className="chips">
            {EXPERIENCE.map((item) => (
              <Chip key={item.id} pressed={experience === item.id} onClick={() => setExperience(item.id)}>
                {item.label}
              </Chip>
            ))}
          </div>
          <p className="eyebrow">Your stuffie</p>
          <div className="guide-tiles">
            {data!.meta.guides.filter((guide) => guide.id !== "custom").map((guide) => (
              <button key={guide.id} type="button" className={guideId === guide.id ? "guide-tile on" : "guide-tile"} aria-pressed={guideId === guide.id} onClick={() => setGuideId(guide.id)}>
                <GuideFace id={guide.id} />
                <span>{guide.name}</span>
              </button>
            ))}
            <button type="button" className={made ? "guide-tile on" : "guide-tile"} aria-pressed={made} onClick={() => setGuideId("custom")}>
              <GuideFace id="custom" stuffie={stuffie} />
              <span>{me.stuffie ? stuffie.name.trim() || "Yours" : "Make your own"}</span>
            </button>
          </div>
          {made ? <StuffieMaker value={stuffie} onChange={setStuffie} /> : null}
          {saveButton}
          {saved ? <p className="fine">Saved.</p> : null}
        </form>
        {data!.demo ? (
          <div className="card stack">
            <h2>Demo pair</h2>
            <p>Hop to the other side of the slash. Rowan leads, Avery follows.</p>
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
