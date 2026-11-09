export function Mark({ className = "mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="24" cy="34" r="16" fill="#ff5a7a" />
      <circle cx="42" cy="30" r="14" fill="#12b5a8" />
      <path d="M30 12l6 40" stroke="#2a1b33" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function GuideFace({ id, className = "guide-face" }: { id: string; className?: string }) {
  if (id === "pip") return <Pip className={className} />;
  if (id === "moss") return <Moss className={className} />;
  if (id === "sol") return <Sol className={className} />;
  return <Lumen className={className} />;
}

function Lumen({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="108" rx="28" ry="6" fill="#ffd0c2" />
      <path d="M30 46l10 16-16 2zM90 46l-10 16 16 2z" fill="#ff5a7a" />
      <path d="M38 48l6 10-8 1zM82 48l-6 10 8 1z" fill="#ffe8dc" />
      <circle cx="60" cy="62" r="32" fill="#ffb085" />
      <circle cx="48" cy="60" r="4" fill="#2a1b33" />
      <circle cx="74" cy="60" r="4" fill="#2a1b33" />
      <path d="M54 74c4 4 10 4 14 0" fill="none" stroke="#2a1b33" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="42" cy="70" r="4" fill="#ff8fa3" opacity="0.8" />
      <circle cx="80" cy="70" r="4" fill="#ff8fa3" opacity="0.8" />
    </svg>
  );
}

function Pip({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="108" rx="26" ry="6" fill="#ffe3a3" />
      <ellipse cx="38" cy="70" rx="16" ry="12" fill="#c5b0ff" transform="rotate(-20 38 70)" />
      <circle cx="64" cy="60" r="28" fill="#ffc14d" />
      <path d="M84 58l16 6-16 8z" fill="#ff8a4c" />
      <circle cx="56" cy="56" r="3.5" fill="#2a1b33" />
      <circle cx="72" cy="56" r="3.5" fill="#2a1b33" />
      <path d="M58 70c4 5 10 5 14 0" fill="none" stroke="#2a1b33" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M48 28l6 10 8-8 2 12 10-4-8 8 8 6-12-2-2 10-6-10-10 4 6-8z" fill="#fff4c8" />
    </svg>
  );
}

function Moss({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="108" rx="26" ry="6" fill="#d8fff4" />
      <ellipse cx="34" cy="62" rx="22" ry="28" fill="#8ee0d4" />
      <ellipse cx="86" cy="62" rx="22" ry="28" fill="#b7efe4" />
      <ellipse cx="60" cy="66" rx="16" ry="26" fill="#ffe08a" />
      <circle cx="54" cy="62" r="3" fill="#2a1b33" />
      <circle cx="68" cy="62" r="3" fill="#2a1b33" />
      <path d="M56 74h10" stroke="#2a1b33" strokeWidth="2" strokeLinecap="round" />
      <path d="M52 40c-8-16-2-22 2-24M68 40c8-16 2-22-2-24" fill="none" stroke="#2a1b33" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Sol({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="108" rx="26" ry="6" fill="#ffd0e0" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <rect
          key={angle}
          x="56"
          y="8"
          width="8"
          height="16"
          rx="4"
          fill="#ff8fab"
          transform={`rotate(${angle} 60 60)`}
        />
      ))}
      <circle cx="60" cy="60" r="28" fill="#ffc14d" />
      <circle cx="50" cy="56" r="3.5" fill="#2a1b33" />
      <circle cx="70" cy="56" r="3.5" fill="#2a1b33" />
      <path d="M52 70c5 6 13 6 18 0" fill="none" stroke="#2a1b33" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function MarkGlyph({ mark }: { mark: string }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true as const };
  if (mark === "star" || mark === "spark") {
    return (
      <svg {...common}>
        <path d="M8 1.4l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L8 10.6 4.3 13l1.1-4.3L2 5.9l4.4-.3z" fill="#fff" />
      </svg>
    );
  }
  if (mark === "moon") {
    return (
      <svg {...common}>
        <path d="M9 1.5a6 6 0 1 0 5.2 9A5 5 0 0 1 9 1.5z" fill="#fff" />
      </svg>
    );
  }
  if (mark === "leaf") {
    return (
      <svg {...common}>
        <path d="M13 2C6 3 2 8 2 13c5 0 10-3 11-11z" fill="#fff" />
      </svg>
    );
  }
  if (mark === "sun") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3" fill="#fff" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13" stroke="#fff" strokeWidth="1.4" />
      </svg>
    );
  }
  if (mark === "fox") {
    return (
      <svg {...common}>
        <path d="M2 3l3 4-2 6h4l1-3 1 3h4l-2-6 3-4-4 2L8 2 6 5z" fill="#fff" />
      </svg>
    );
  }
  if (mark === "flower") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2" fill="#fff" />
        <circle cx="8" cy="3.2" r="2" fill="#fff" />
        <circle cx="8" cy="12.8" r="2" fill="#fff" />
        <circle cx="3.2" cy="8" r="2" fill="#fff" />
        <circle cx="12.8" cy="8" r="2" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 13s-5-3.1-5-6.2A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5 1.8C13 9.9 8 13 8 13z" fill="#fff" />
    </svg>
  );
}
