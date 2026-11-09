import { useState } from "react";
import { MARKS } from "../format.ts";
import { GuideFace } from "../guides.tsx";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import type { Pronouns } from "../types.ts";
import { Chip, Field, Shell } from "../ui.tsx";

const GENDERS = ["woman", "man", "nonbinary", "genderfluid", "agender", "bigender"];
const STEP_KEY = "slash.step";

export function Onboarding() {
  const { data, request } = useSession();
  const me = data!.me;
  const meta = data!.meta;
  const [step, setStep] = useState(() => {
    const saved = Number(sessionStorage.getItem(STEP_KEY) || 0);
    return Number.isFinite(saved) ? Math.min(7, Math.max(0, saved)) : 0;
  });
  const [pronouns, setPronouns] = useState<Pronouns>(
    me.pronouns || meta.pronouns[2] || { label: "they/them", subject: "they", object: "them", possessive: "their", reflexive: "themself" },
  );
  const [customPronouns, setCustomPronouns] = useState(
    Boolean(me.pronouns && !meta.pronouns.some((item) => item.label === me.pronouns?.label)),
  );
  const [gender, setGender] = useState(me.gender || "");
  const [side, setSide] = useState<"" | "leading" | "following">(me.slashSide);
  const [role, setRole] = useState(me.roleTitle || "");
  const [goals, setGoals] = useState<string[]>(me.goals || []);
  const [supplies, setSupplies] = useState<string[]>(me.supplies || []);
  const [supplyDraft, setSupplyDraft] = useState("");
  const [hue, setHue] = useState(me.avatar?.hue ?? 16);
  const [mark, setMark] = useState(me.avatar?.mark || "heart");
  const [guideId, setGuideId] = useState(me.guideId || "");
  const [pending, setPending] = useState(false);

  function remember(next: number) {
    sessionStorage.setItem(STEP_KEY, String(next));
    setStep(next);
  }

  async function save(partial: Record<string, unknown>, next: number) {
    setPending(true);
    try {
      await request("/api/profile", { method: "PATCH", body: partial });
      remember(next);
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    setPending(true);
    try {
      await request("/api/profile", {
        method: "PATCH",
        body: {
          pronouns,
          gender,
          slashSide: side,
          roleTitle: role,
          goals,
          supplies,
          avatar: { hue, mark },
          guideId,
          onboardingComplete: true,
        },
      });
      sessionStorage.removeItem(STEP_KEY);
      go("/pair");
    } catch {
      /* toast */
    } finally {
      setPending(false);
    }
  }

  function addSupply() {
    const next = supplyDraft.trim();
    if (!next) return;
    setSupplies((current) => (current.includes(next) ? current : [...current, next]));
    setSupplyDraft("");
  }

  const titles = [
    "Which pronouns should we use?",
    "How do you describe your gender?",
    "Which side of the slash are you on?",
    "What do you want to be called here?",
    "What are you here for?",
    "What self-care do you actually have?",
    "Pick an avatar",
    "Choose your guide",
  ];

  return (
    <Shell>
      <div className="setup">
        <div className="dots" aria-hidden="true">
          {titles.map((title, index) => (
            <i key={title} className={index <= step ? "on" : ""} />
          ))}
        </div>
        <p className="eyebrow">Step {step + 1} of {titles.length}</p>
        <h1>{titles[step]}</h1>

        {step === 0 ? (
          <div className="stack">
            <p className="lead">These show up in titles and in the way your partner’s screen talks about you.</p>
            <div className="chips">
              {meta.pronouns.map((item) => (
                <Chip
                  key={item.label}
                  pressed={!customPronouns && pronouns.label === item.label}
                  onClick={() => {
                    setCustomPronouns(false);
                    setPronouns(item);
                  }}
                >
                  {item.label}
                </Chip>
              ))}
              <Chip pressed={customPronouns} onClick={() => setCustomPronouns(true)}>
                I’ll type them
              </Chip>
            </div>
            {customPronouns ? (
              <div className="stack">
                <Field label="Subject, as in “___ sent a note”">
                  <input value={pronouns.subject} onChange={(event) => setPronouns({ ...pronouns, subject: event.target.value, label: `${event.target.value}/${pronouns.object}` })} />
                </Field>
                <Field label="Object, as in “ask ___”">
                  <input value={pronouns.object} onChange={(event) => setPronouns({ ...pronouns, object: event.target.value, label: `${pronouns.subject}/${event.target.value}` })} />
                </Field>
                <Field label="Possessive, as in “___ streak”">
                  <input value={pronouns.possessive} onChange={(event) => setPronouns({ ...pronouns, possessive: event.target.value })} />
                </Field>
              </div>
            ) : null}
            <button
              className="primary"
              type="button"
              disabled={pending || !pronouns.subject || !pronouns.object || !pronouns.possessive}
              onClick={() => void save({ pronouns }, 1)}
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="stack">
            <p className="lead">Suggestions only. Type your own words if none of these fit. You can skip this.</p>
            <div className="chips">
              {GENDERS.map((item) => (
                <Chip key={item} pressed={gender.toLowerCase() === item} onClick={() => setGender(item)}>
                  {item}
                </Chip>
              ))}
            </div>
            <Field label="Gender, in your words">
              <input value={gender} onChange={(event) => setGender(event.target.value)} placeholder="Type anything, or leave this blank" />
            </Field>
            <button className="primary" type="button" disabled={pending} onClick={() => void save({ gender }, 2)}>
              Continue
            </button>
            <button className="texty" type="button" disabled={pending} onClick={() => void save({ gender: "" }, 2)}>
              Skip
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="stack">
            <button className={side === "leading" ? "choice on" : "choice"} type="button" onClick={() => setSide("leading")}>
              <strong>Leading</strong>
              <span>You assign tasks, notice follow-through, and agree rewards together.</span>
            </button>
            <button className={side === "following" ? "choice on" : "choice"} type="button" onClick={() => setSide("following")}>
              <strong>Following</strong>
              <span>You receive tasks, build the streak, and ask for rewards you both agreed on.</span>
            </button>
            <button className="primary" type="button" disabled={pending || !side} onClick={() => void save({ slashSide: side }, 3)}>
              Continue
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="stack">
            <p className="lead">These are adult names for your side of the dynamic. Type your own if none fit.</p>
            <div className="chips">
              {(side === "leading" ? meta.roles.leading : meta.roles.following).map((item) => (
                <Chip key={item} pressed={role === item} onClick={() => setRole(item)}>
                  {item}
                </Chip>
              ))}
            </div>
            <Field label="Role title">
              <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Your title" />
            </Field>
            <button className="primary" type="button" disabled={pending || role.trim().length < 2} onClick={() => void save({ roleTitle: role.trim() }, 4)}>
              Continue
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="stack">
            <div className="chips">
              {meta.goals.map((goal) => (
                <Chip
                  key={goal.key}
                  pressed={goals.includes(goal.key)}
                  onClick={() => setGoals((current) => (current.includes(goal.key) ? current.filter((key) => key !== goal.key) : [...current, goal.key]))}
                >
                  {goal.title}
                </Chip>
              ))}
            </div>
            <button className="primary" type="button" disabled={pending || goals.length === 0} onClick={() => void save({ goals }, 5)}>
              Continue
            </button>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="stack">
            <p className="lead">Tasks will mention what you list, so you are not handed a ritual you cannot do.</p>
            <div className="chips">
              {supplies.map((item) => (
                <Chip key={item} pressed onClick={() => setSupplies((current) => current.filter((supply) => supply !== item))}>
                  {item} ×
                </Chip>
              ))}
            </div>
            <Field label="Add something you own or already love">
              <input
                value={supplyDraft}
                placeholder="face mask, journal, bubble bath"
                onChange={(event) => setSupplyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSupply();
                  }
                }}
              />
            </Field>
            <button className="ghost" type="button" onClick={addSupply}>
              Add to the list
            </button>
            <button className="primary" type="button" disabled={pending} onClick={() => void save({ supplies }, 6)}>
              Continue
            </button>
          </div>
        ) : null}

        {step === 6 ? (
          <div className="stack">
            <span className="avatar xl" style={{ background: `hsl(${hue} 78% 58%)` }}>
              {me.displayName.slice(0, 1).toUpperCase()}
            </span>
            <Field label="Color">
              <input type="range" min={0} max={360} value={hue} onChange={(event) => setHue(Number(event.target.value))} />
            </Field>
            <div className="chips">
              {MARKS.map((item) => (
                <Chip key={item} pressed={mark === item} onClick={() => setMark(item)}>
                  {item}
                </Chip>
              ))}
            </div>
            <button className="primary" type="button" disabled={pending} onClick={() => void save({ avatar: { hue, mark } }, 7)}>
              Continue
            </button>
          </div>
        ) : null}

        {step === 7 ? (
          <div className="stack">
            <div className="guide-pick">
              {meta.guides.map((guide) => (
                <button key={guide.id} type="button" className={guideId === guide.id ? "guide-card on" : "guide-card"} onClick={() => setGuideId(guide.id)}>
                  <GuideFace id={guide.id} />
                  <strong>{guide.name}</strong>
                  <span>{guide.blurb}</span>
                </button>
              ))}
            </div>
            <button className="primary" type="button" disabled={pending || !guideId} onClick={() => void finish()}>
              {pending ? "Saving…" : "Enter SlashConnect"}
            </button>
          </div>
        ) : null}

        {step > 0 ? (
          <button className="texty" type="button" onClick={() => remember(step - 1)}>
            Back
          </button>
        ) : null}
      </div>
    </Shell>
  );
}
