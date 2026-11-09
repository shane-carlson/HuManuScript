import type { ReactNode } from "react";
import { GuideFace, MarkGlyph } from "./guides.tsx";
import { go, useHash } from "./route.ts";
import { useSession } from "./session.tsx";
import type { Person } from "./types.ts";

const TABS = [
  { id: "home", label: "Home", href: "/home" },
  { id: "tasks", label: "Tasks", href: "/tasks" },
  { id: "goals", label: "Goals", href: "/goals" },
  { id: "rewards", label: "Rewards", href: "/rewards" },
  { id: "more", label: "More", href: "/more" },
];

export function Shell({ children, nav = false }: { children: ReactNode; nav?: boolean }) {
  const { error, clearError, celebration, clearCelebration, data } = useSession();
  return (
    <div className="slash">
      <div className="stage">
        <div className="phone">
          <div className="scroll">
            {error ? (
              <button className="toast" type="button" onClick={clearError}>
                {error}
              </button>
            ) : null}
            {children}
          </div>
          {nav ? <TabBar /> : null}
          {celebration && data ? (
            <div className="celebrate" role="dialog" aria-label={celebration.title}>
              <Confetti />
              <GuideFace id={data.me.guideId || "lumen"} />
              <p className="eyebrow">{cheer(celebration.kind)}</p>
              <h2>{celebration.title}</h2>
              <p>{celebration.detail}</p>
              <button className="primary" type="button" onClick={clearCelebration}>
                Carry on
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function cheer(kind: string) {
  if (kind === "level") return "Level up";
  if (kind === "streak") return "Look at that streak";
  if (kind === "reward") return "Granted";
  if (kind === "pair") return "Hello, you two";
  return "Well done";
}

function TabBar() {
  const { parts } = useHash();
  const current = parts[0] || "home";
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => {
        const on = current === tab.id || (tab.id === "home" && current === "");
        return (
          <button key={tab.id} type="button" className={on ? "tab on" : "tab"} aria-current={on ? "page" : undefined} onClick={() => go(tab.href)}>
            <TabIcon id={tab.id} />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function TabIcon({ id }: { id: string }) {
  const common = { viewBox: "0 0 24 24", width: 18, height: 18, "aria-hidden": true as const, fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (id === "tasks") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <path d="M8 12l2.5 2.5L16 9" />
      </svg>
    );
  }
  if (id === "goals") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (id === "rewards") {
    return (
      <svg {...common}>
        <path d="M12 4l2.2 4.6L19 9.2l-3.5 3.4.8 4.9L12 15.8 7.7 17.5l.8-4.9L5 9.2l4.8-.6z" />
      </svg>
    );
  }
  if (id === "more") {
    return (
      <svg {...common}>
        <circle cx="6" cy="12" r="1.3" fill="currentColor" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" />
        <circle cx="18" cy="12" r="1.3" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-5v-5H10v5H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function Avatar({ person, size = 52 }: { person: Pick<Person, "displayName" | "avatar">; size?: number }) {
  const initials = person.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, background: `hsl(${person.avatar?.hue ?? 16} 78% 58%)` }}>
      <span>{initials}</span>
      <i>
        <MarkGlyph mark={person.avatar?.mark || "heart"} />
      </i>
    </span>
  );
}

export function Confetti() {
  const colors = ["#ff5a7a", "#ffc14d", "#12b5a8", "#c5b0ff", "#ffb085", "#fff"];
  return (
    <div className="confetti" aria-hidden="true">
      {colors.concat(colors, colors, colors).map((color, index) => (
        <i
          key={`${color}-${index}`}
          style={{
            left: `${(index * 17) % 100}%`,
            background: color,
            animationDelay: `${(index % 9) * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={pressed ? "chip on" : "chip"} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

export function Meter({ value }: { value: number }) {
  const width = `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
  return (
    <span className="meter" aria-hidden="true">
      <span style={{ width }} />
    </span>
  );
}

export function PageHead({ title, kicker, action }: { title: string; kicker?: string; action?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {kicker ? <p className="eyebrow">{kicker}</p> : null}
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}
