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
    "What are your pronouns?",
    "And your gender?",
    "Which side of the slash are you?",
    "What do you go by?",
    "What do you two want out of this?",
    "What’s in your self-care stash?",
    "Make your avatar",
    "Pick your stuffie",
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
            <p className="lead">Your partner’s screen uses these when it talks about you.</p>
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
              Next
            </button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="stack">
            <p className="lead">These are only suggestions. Use your own words, or skip it.</p>
            <div className="chips">
              {GENDERS.map((item) => (
                <Chip key={item} pressed={gender.toLowerCase() === item} onClick={() => setGender(item)}>
                  {item}
                </Chip>
              ))}
            </div>
            <Field label="Gender, in your words">
              <input value={gender} onChange={(event) => setGender(event.target.value)} placeholder="Anything you like" />
            </Field>
            <button className="primary" type="button" disabled={pending} onClick={() => void save({ gender }, 2)}>
              Next
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
              <span>The D‑type side. You hand out the tasks, give the praise, and grant the rewards.</span>
            </button>
            <button className={side === "following" ? "choice on" : "choice"} type="button" onClick={() => setSide("following")}>
              <strong>Following</strong>
              <span>The s‑type side. You do the tasks, keep the streak going, and cash in points for rewards.</span>
            </button>
            <button className="primary" type="button" disabled={pending || !side} onClick={() => void save({ slashSide: side }, 3)}>
              Next
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="stack">
            <p className="lead">What does your partner call you? These are all adult roles. Type your own if it’s not here.</p>
            <div className="chips">
              {(side === "leading" ? meta.roles.leading : meta.roles.following).map((item) => (
                <Chip key={item} pressed={role === item} onClick={() => setRole(item)}>
                  {item}
                </Chip>
              ))}
            </div>
            <Field label="Your title">
              <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Anything you like" />
            </Field>
            <button className="primary" type="button" disabled={pending || role.trim().length < 2} onClick={() => void save({ roleTitle: role.trim() }, 4)}>
              Next
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="stack">
            <p className="lead">Pick as many as you like. Each one turns into a goal you’ll both see.</p>
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
              Next
            </button>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="stack">
            <p className="lead">List what you actually own. It’s annoying to be told to take a bubble bath when you’re out of bubbles.</p>
            <div className="chips">
              {supplies.map((item) => (
                <Chip key={item} pressed onClick={() => setSupplies((current) => current.filter((supply) => supply !== item))}>
                  {item} ×
                </Chip>
              ))}
            </div>
            <Field label="Add something you have">
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
              Add it
            </button>
            <button className="primary" type="button" disabled={pending} onClick={() => void save({ supplies }, 6)}>
              Next
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
              Next
            </button>
          </div>
        ) : null}

        {step === 7 ? (
          <div className="stack">
            <p className="lead">They live on your home screen and have opinions. Tap them when you want a word.</p>
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
              {pending ? "Saving…" : "Let’s go"}
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
