import { useState } from "react";
import { freshSeed } from "../seeded.ts";
import { MadeStuffie } from "./Plush.tsx";
import { TEMPERAMENTS, rollStuffie, type Stuffie } from "./roll.ts";

const NAME_MAX = 24;

/**
 * Rolls a stuffie from parts. Every roll comes from one number, so "Back one"
 * brings the last plush back exactly, and what is saved is what was shown.
 */
export function StuffieMaker({ value, onChange }: { value: Stuffie; onChange: (next: Stuffie) => void }) {
  const [before, setBefore] = useState<Stuffie[]>([]);
  const [cheering, setCheering] = useState(false);
  const renamed = Boolean(value.name.trim()) && value.name !== rollStuffie(value.seed).name;

  function roll() {
    let seed = freshSeed();
    if (seed === value.seed) seed = (seed + 1) >>> 0;
    const next = rollStuffie(seed, value.voice);
    setBefore((list) => [...list, value].slice(-20));
    onChange(renamed ? { ...next, name: value.name } : next);
  }

  function back() {
    const last = before[before.length - 1];
    if (!last) return;
    setBefore((list) => list.slice(0, -1));
    onChange({ ...last, voice: value.voice });
  }

  return (
    <div className="maker">
      <div className="maker-stage">
        <div className="maker-plush fresh" key={value.seed}>
          <MadeStuffie stuffie={value} className={cheering ? "guide-face xl cheering" : "guide-face xl"} cheer={cheering} />
        </div>
        <p className="maker-who" aria-live="polite">
          <strong>{value.name.trim() || "No name yet"}</strong>
          <br />
          {value.species}
        </p>
        <button className="texty" type="button" aria-pressed={cheering} onClick={() => setCheering((on) => !on)}>
          {cheering ? "Settle down" : "Watch it celebrate"}
        </button>
      </div>

      <div className="maker-rolls">
        <button className="primary" type="button" onClick={roll}>
          <Dice />
          Roll again
        </button>
        <button className="ghost" type="button" disabled={before.length === 0} onClick={back}>
          Back one
        </button>
      </div>

      <label className="field">
        <span>Its name</span>
        <input value={value.name} maxLength={NAME_MAX} placeholder="Give it a name" onChange={(event) => onChange({ ...value, name: event.target.value.replace(/[<>]/g, "") })} />
      </label>

      <p className="eyebrow">What’s it like?</p>
      <div className="maker-moods">
        {TEMPERAMENTS.map((mood) => (
          <button
            key={mood.voice}
            type="button"
            className={value.voice === mood.voice ? "choice on" : "choice"}
            aria-pressed={value.voice === mood.voice}
            onClick={() => onChange({ ...value, voice: mood.voice })}
          >
            <strong>{mood.title}</strong>
            <span>{mood.line}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Dice() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <rect x="2.5" y="2.5" width="15" height="15" rx="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="7" cy="7" r="1.3" fill="currentColor" />
      <circle cx="13" cy="13" r="1.3" fill="currentColor" />
      <circle cx="10" cy="10" r="1.3" fill="currentColor" />
    </svg>
  );
}
