import { useState } from "react";
import { Badge } from "../progress/Badge.tsx";
import { longDate, shelfCount, sideOf, whoBy } from "../progress/words.ts";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import type { Bundle, Trophy } from "../types.ts";
import { Meter, PageHead, Shell } from "../ui.tsx";
import "../progress/progress.css";

const PER_ROW = 3;

function groupsFor(bundle: Bundle) {
  const side = sideOf(bundle);
  return [
    { id: "levels", title: "Levels", line: "One for every level the two of you reach." },
    { id: "firsts", title: "Firsts and together", line: "The first time for things, and time spent paired." },
    { id: "showing-up", title: "Showing up", line: side.mine ? "Yours, for tasks and streaks." : side.paired ? `${side.name}’s, for tasks and streaks.` : "For tasks and streaks." },
    { id: "care", title: "Care", line: bundle.me.slashSide === "leading" ? "Yours, for well dones." : side.paired ? `${side.leader}’s, for well dones.` : "For well dones." },
  ];
}

function Detail({ trophy, bundle }: { trophy: Trophy; bundle: Bundle }) {
  if (!trophy.earned) {
    const counting = trophy.have != null && trophy.need != null;
    return (
      <div className="pg-detail locked" role="status">
        <Badge tint={trophy.tint} group={trophy.group} size={72} />
        <div>
          <p className="eyebrow">Not yet</p>
          <h3>{trophy.hint}</h3>
          {counting ? (
            <>
              <Meter value={trophy.have! / trophy.need!} />
              <p className="muted">
                {trophy.have!.toLocaleString()} of {trophy.need!.toLocaleString()}
              </p>
            </>
          ) : (
            <p className="muted">It shows up here the moment it happens.</p>
          )}
        </div>
      </div>
    );
  }
  const who = whoBy(trophy.by, bundle);
  return (
    <div className="pg-detail" role="status">
      <Badge art={trophy.art} tint={trophy.tint} size={88} label={trophy.title} />
      <div>
        <p className="eyebrow">{who ? `${who} · ${longDate(trophy.day)}` : longDate(trophy.day)}</p>
        <h3>{trophy.title}</h3>
        <p>{trophy.line}</p>
        {trophy.early ? <p className="muted">Earned before there was a shelf to put it on.</p> : null}
      </div>
    </div>
  );
}

export function Gallery() {
  const { data } = useSession();
  const bundle = data!;
  const shelf = bundle.shelf || [];
  const [picked, setPicked] = useState("");
  const count = shelfCount(bundle);
  const latest = shelf
    .filter((item): item is Extract<Trophy, { earned: true }> => item.earned)
    .sort((a, b) => b.at.localeCompare(a.at))[0];

  return (
    <Shell nav>
      <div className="pad pg-page">
        <PageHead
          title="Trophy shelf"
          kicker={bundle.partner ? "One shelf, both of yours" : "Room on it for two"}
          action={
            <button className="texty" type="button" onClick={() => go("/progress")}>
              Progress
            </button>
          }
        />

        {shelf.length === 0 ? <p className="muted">Nothing to show yet. Try again in a moment.</p> : null}

        {shelf.length > 0 ? (
          <section className="pg-shelf-top">
            <p className="pg-shelf-count">
              <strong>{count.have}</strong> of {count.of} on the shelf
            </p>
            <Meter value={count.have / count.of} />
            <p className="muted">
              {latest ? `Newest: ${latest.title}, ${longDate(latest.day)}.` : "Empty for now. The first task puts something on it."} Tap any patch for its story.
            </p>
          </section>
        ) : null}

        {groupsFor(bundle).map((group) => {
          const items = shelf.filter((item) => item.group === group.id);
          if (!items.length) return null;
          const rows = [];
          for (let index = 0; index < items.length; index += PER_ROW) rows.push(items.slice(index, index + PER_ROW));
          const have = items.filter((item) => item.earned).length;
          return (
            <section key={group.id} className="pg-group">
              <div className="row spread">
                <h2>{group.title}</h2>
                <span className="pg-patch">
                  {have} of {items.length}
                </span>
              </div>
              <p className="muted">{group.line}</p>
              {rows.map((row) => {
                const open = row.find((item) => item.id === picked);
                return (
                  <div key={row[0].id} className="pg-shelf-row">
                    <div className="pg-tiles">
                      {row.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`pg-tile-btn${item.earned ? "" : " locked"}${item.id === picked ? " on" : ""}`}
                          aria-expanded={item.id === picked}
                          onClick={() => setPicked(item.id === picked ? "" : item.id)}
                        >
                          <Badge art={item.earned ? item.art : undefined} tint={item.tint} group={item.group} size={70} />
                          {item.earned ? (
                            <>
                              <strong>{item.title}</strong>
                              <em>{whoBy(item.by, bundle)}</em>
                            </>
                          ) : (
                            <em className="pg-hint">{item.hint}</em>
                          )}
                        </button>
                      ))}
                    </div>
                    {open ? <Detail trophy={open} bundle={bundle} /> : null}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
