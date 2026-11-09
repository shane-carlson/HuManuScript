import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import { PageHead, Shell } from "../ui.tsx";

const LINKS = [
  { href: "/guide", title: "Guide", detail: "Encouragement and a check-in with the companion you picked." },
  { href: "/ground", title: "Grounding", detail: "Box breathing, a counting round, and a note if you want company." },
  { href: "/pair", title: "Your pair", detail: "Invite by email or text, or enter the code you were sent." },
  { href: "/profile", title: "Profile", detail: "Pronouns, gender, role, supplies, and your guide." },
  { href: "/assign", title: "Assign", detail: "Leading partner picks a task type and sends it." },
];

export function More() {
  const { data } = useSession();
  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="More" kicker={data?.me.displayName} />
        <div className="stack">
          {LINKS.map((link) => (
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
