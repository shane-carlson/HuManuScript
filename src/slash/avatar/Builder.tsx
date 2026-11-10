import { useState } from "react";
import { freshSeed, seeded } from "../seeded.ts";
import { AvatarFace } from "./Face.tsx";
import { CHOICES, LOOK_TABS, SLOT_LABELS, randomLook, type Look, type Slot } from "./looks.ts";

const SWATCHES: Slot[] = ["skin", "hairColor", "top", "backdrop"];

/** Small parts are hard to tell apart on a whole head, so their tiles lean in closer. */
const CLOSE_UP: Partial<Record<Slot, string>> = {
  eyes: "close-face",
  brows: "close-face",
  mouth: "close-face",
  cheeks: "close-face",
  facialHair: "close-face",
  glasses: "close-face",
  earrings: "close-ears",
  neck: "close-neck",
  topper: "close-top",
};

/** The character builder: a big live preview, a dice button, and every choice a tap away. */
export function LookBuilder({ look, onChange }: { look: Look; onChange: (next: Look) => void }) {
  const [tab, setTab] = useState(LOOK_TABS[0].id);
  const current = LOOK_TABS.find((item) => item.id === tab) || LOOK_TABS[0];

  return (
    <div className="look-builder">
      <div className="look-stage">
        <AvatarFace look={look} size={128} className="look-big" />
        <div className="look-stage-side">
          <div className="look-small" aria-hidden="true">
            <AvatarFace look={look} size={44} />
            <span>How it looks around the app</span>
          </div>
          <button className="ghost tiny look-dice" type="button" onClick={() => onChange(randomLook(seeded(freshSeed())))}>
            <Dice />
            Surprise me
          </button>
        </div>
      </div>

      <div className="look-tabs" role="tablist" aria-label="Parts of your look">
        {LOOK_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === current.id}
            className={item.id === current.id ? "look-tab on" : "look-tab"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="look-panel" role="tabpanel" aria-label={current.label}>
        {current.slots.map((slot) => (
          <section key={slot} className="look-slot">
            <p className="eyebrow">{SLOT_LABELS[slot]}</p>
            {SWATCHES.includes(slot) ? (
              <div className="look-swatches">
                {CHOICES[slot].map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={look[slot] === choice.id ? "look-swatch on" : "look-swatch"}
                    aria-pressed={look[slot] === choice.id}
                    aria-label={choice.label}
                    title={choice.label}
                    style={{ background: choice.color }}
                    onClick={() => onChange({ ...look, [slot]: choice.id })}
                  />
                ))}
              </div>
            ) : (
              <div className="look-tiles">
                {CHOICES[slot].map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={look[slot] === choice.id ? "look-tile on" : "look-tile"}
                    aria-pressed={look[slot] === choice.id}
                    onClick={() => onChange({ ...look, [slot]: choice.id })}
                  >
                    <AvatarFace look={{ ...look, [slot]: choice.id }} size={52} className={CLOSE_UP[slot]} />
                    <span>{choice.label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
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
