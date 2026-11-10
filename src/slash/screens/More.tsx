import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import { PageHead, Shell } from "../ui.tsx";

const LINKS = [
  { href: "/weekly", title: "Weekly check-in", detail: "Once a week: how you are, how the two of you are, and what you’d like next." },
  { href: "/progress", title: "Progress", detail: "Levels, streaks, and the last twelve weeks, day by day." },
  { href: "/gallery", title: "Trophy shelf", detail: "Every patch the two of you have earned, and the ones still to come." },
  { href: "/guide", title: "Your stuffie", detail: "A pep talk whenever you want one." },
  { href: "/ground", title: "Grounding", detail: "Box breathing, counting things, and a note to your partner if you want company." },
  { href: "/assign", title: "Give a task", detail: "Pick one and send it over.", leadingOnly: true },
  { href: "/pair", title: "The two of you", detail: "Invite your partner, or enter the code they sent." },
  { href: "/profile", title: "You", detail: "Your title, your stash, and which stuffie you keep." },
];

export function More() {
  const { data } = useSession();
  const links = LINKS.filter((link) => !link.leadingOnly || data?.me.slashSide === "leading");
  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="More" kicker={data?.me.displayName} />
        <div className="stack">
          {links.map((link) => (
            <button key={link.href} className="task" type="button" onClick={() => go(link.href)}>
              <strong>{link.title}</strong>
              <em>{link.detail}</em>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}
