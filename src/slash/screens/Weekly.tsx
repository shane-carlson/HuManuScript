import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { firstName, prettyDate } from "../format.ts";
import { go } from "../route.ts";
import { useSession } from "../session.tsx";
import type { Person, Weekly as WeeklyData, WeeklyEntry, WeeklyWeek } from "../types.ts";
import { Avatar, PageHead, Shell } from "../ui.tsx";
import {
  SELF_SCALE,
  US_SCALE,
  clearDraft,
  draftFrom,
  leadMove,
  readDraft,
  saysSomething,
  weekRange,
  weeklyParts,
  writeDraft,
  type WeeklyDraft,
  type WeeklyPart,
} from "../weekly.ts";
import "../weekly.css";

const HEART = "M12 20.5C6.2 16.3 3 13 3 9.2 3 6.6 5 4.6 7.5 4.6c1.8 0 3.4 1 4.5 2.6 1.1-1.6 2.7-2.6 4.5-2.6C19 4.6 21 6.6 21 9.2c0 3.8-3.2 7.1-9 11.3z";

function StitchedHeart({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path className="wk-heart-body" d={HEART} />
      <path className="wk-heart-stitch" d={HEART} transform="translate(12 12.6) scale(0.7) translate(-12 -12.6)" />
    </svg>
  );
}

function HeartScale({ label, scale, value, onChange }: { label: string; scale: string[]; value: number; onChange: (next: number) => void }) {
  return (
    <div className="wk-scale">
      <div className="wk-hearts" role="radiogroup" aria-label={label}>
        {scale.map((word, index) => {
          const step = index + 1;
          return (
            <button
              key={word}
              type="button"
              role="radio"
              aria-checked={value === step}
              aria-label={`${step} of 5: ${word}`}
              className={step <= value ? "wk-heart on" : "wk-heart"}
              onClick={() => onChange(value === step ? 0 : step)}
            >
              <StitchedHeart size={34} />
            </button>
          );
        })}
      </div>
      <p className="wk-scale-word" aria-live="polite">
        {value ? scale[value - 1] : <span>Tap a heart if one fits. Or skip it.</span>}
      </p>
    </div>
  );
}

function HeartRow({ scale, value }: { scale: string[]; value: number }) {
  if (!value) return null;
  return (
    <p className="wk-rated" aria-label={`${value} of 5: ${scale[value - 1]}`}>
      <span aria-hidden="true">
        {scale.map((word, index) => (
          <i key={word} className={index < value ? "on" : ""}>
            <StitchedHeart size={17} />
          </i>
        ))}
      </span>
      <strong>{scale[value - 1]}</strong>
    </p>
  );
}

function CheckinForm({ weekly, me, partnerName, onDone, onCancel }: {
  weekly: WeeklyData;
  me: Person;
  partnerName: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { request } = useSession();
  const [draft, setDraft] = useState<WeeklyDraft>(() => readDraft(me.id, weekly.week) || draftFrom(weekly.mine));
  const [pending, setPending] = useState(false);
  const parts = weeklyParts(me.slashSide, partnerName);
  const choices = weekly.choices.filter((choice) => !choice.side || choice.side === me.slashSide || draft.requests.includes(choice.id));
  const editing = Boolean(weekly.mine);
  const ready = saysSomething(draft);

  const sent = useRef(false);

  useEffect(() => {
    if (!sent.current) writeDraft(me.id, weekly.week, draft, weekly.mine);
  }, [draft, me.id, weekly.week, weekly.mine]);

  const set = (patch: Partial<WeeklyDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const toggle = (id: string) => set({ requests: draft.requests.includes(id) ? draft.requests.filter((item) => item !== id) : [...draft.requests, id] });

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setPending(true);
    try {
      await request("/api/weekly", { method: "POST", body: draft });
      sent.current = true;
      clearDraft(me.id, weekly.week);
      onDone();
    } catch {
      /* The toast shows the problem, and what they wrote stays in the form. */
    } finally {
      setPending(false);
    }
  }

  const writing = (part: WeeklyPart, value: string, change: (next: string) => void, max: number, rows: number) => (
    <>
      <textarea
        className="wk-area"
        aria-label={part.title}
        value={value}
        rows={rows}
        maxLength={max}
        placeholder={part.placeholder}
        onChange={(event) => change(event.target.value)}
      />
      {value.length > max * 0.85 ? <p className="fine wk-count">{value.length} of {max}</p> : null}
    </>
  );

  return (
    <form className="stack" onSubmit={(event) => void send(event)}>
      <section className="card wk-part">
        <p className="eyebrow">One of four</p>
        <h2>{parts[0].title}</h2>
        <p className="wk-prompt">{parts[0].prompt}</p>
        <HeartScale label="How I’ve felt about myself this week" scale={SELF_SCALE} value={draft.selfRating} onChange={(next) => set({ selfRating: next })} />
        {writing(parts[0], draft.self, (next) => set({ self: next }), weekly.limits.text, 4)}
      </section>

      <section className="card wk-part">
        <p className="eyebrow">Two of four</p>
        <h2>{parts[1].title}</h2>
        <p className="wk-prompt">{parts[1].prompt}</p>
        <HeartScale label="How I’ve felt about us this week" scale={US_SCALE} value={draft.dynamicRating} onChange={(next) => set({ dynamicRating: next })} />
        {writing(parts[1], draft.dynamic, (next) => set({ dynamic: next }), weekly.limits.text, 4)}
      </section>

      <section className="card wk-part">
        <p className="eyebrow">Three of four</p>
        <h2>{parts[2].title}</h2>
        <p className="wk-prompt">{parts[2].prompt}</p>
        {writing(parts[2], draft.needs, (next) => set({ needs: next }), weekly.limits.text, 4)}
      </section>

      <section className="card wk-part">
        <p className="eyebrow">Four of four</p>
        <h2>{parts[3].title}</h2>
        <p className="wk-prompt">{parts[3].prompt}</p>
        <div className="wk-picks" role="group" aria-label="Things I’d like more of">
          {choices.map((choice) => {
            const on = draft.requests.includes(choice.id);
            return (
              <button key={choice.id} type="button" className={on ? "wk-pick on" : "wk-pick"} aria-pressed={on} onClick={() => toggle(choice.id)}>
                {choice.label}
              </button>
            );
          })}
        </div>
        <p className="wk-label">In my own words</p>
        {writing(parts[3], draft.requestNote, (next) => set({ requestNote: next }), weekly.limits.note, 3)}
      </section>

      <div className="stack tight">
        <button className="primary wide" type="submit" disabled={!ready || pending}>
          {editing ? "Save my changes" : "Send my check-in"}
        </button>
        {onCancel ? (
          <button className="ghost wide" type="button" onClick={onCancel}>
            Leave it as it was
          </button>
        ) : null}
        <p className="fine wk-center">
          {!ready
            ? "Nothing here is required. Say one thing, anywhere, and it can go."
            : editing
              ? `You can keep changing it until ${prettyDate(weekly.weekEnd)}.`
              : `${partnerName} reads it once both of you have sent one. You can change yours until ${prettyDate(weekly.weekEnd)}.`}
        </p>
      </div>
    </form>
  );
}

function Voice({ person, label, entry, children }: { person: Person; label: string; entry: WeeklyEntry; children: React.ReactNode }) {
  return (
    <div className={`wk-voice ${person.slashSide}`}>
      <p className="wk-who">
        <Avatar person={person} size={26} />
        <strong>{label}</strong>
        {entry.edited ? <em>edited</em> : null}
      </p>
      {children}
    </div>
  );
}

function Words({ text, rating, scale }: { text: string; rating?: number; scale?: string[] }) {
  if (!text && !rating) return <p className="wk-blank">Left this one blank.</p>;
  return (
    <>
      {scale && rating ? <HeartRow scale={scale} value={rating} /> : null}
      {text ? <p className="wk-words">{text}</p> : null}
    </>
  );
}

function Reading({ pair, weekly, me, partner, waitingTaskId }: {
  pair: Pick<WeeklyWeek, "mine" | "partner">;
  weekly: WeeklyData;
  me: Person;
  partner: Person;
  waitingTaskId?: string;
}) {
  const theirName = firstName(partner.displayName);
  const parts = weeklyParts(me.slashSide, theirName);
  const { mine, partner: theirs } = pair;
  const labelOf = (id: string) => weekly.choices.find((choice) => choice.id === id)?.label || "";
  const section = (part: WeeklyPart, render: (entry: WeeklyEntry) => React.ReactNode) => (
    <section className="card wk-part" key={part.id}>
      <h2>{part.short}</h2>
      {theirs ? <Voice person={partner} label={theirName} entry={theirs}>{render(theirs)}</Voice> : null}
      {mine ? <Voice person={me} label="You" entry={mine}>{render(mine)}</Voice> : null}
    </section>
  );
  const theirAsks = theirs ? theirs.requests.filter((id) => labelOf(id)) : [];
  const myAsks = mine ? mine.requests.filter((id) => labelOf(id)) : [];

  return (
    <div className="stack">
      {section(parts[0], (entry) => <Words text={entry.self} rating={entry.selfRating} scale={SELF_SCALE} />)}
      {section(parts[1], (entry) => <Words text={entry.dynamic} rating={entry.dynamicRating} scale={US_SCALE} />)}
      {section(parts[2], (entry) => <Words text={entry.needs} />)}

      <section className="card wk-part">
        <h2>{parts[3].short}</h2>
        {theirs ? (
          <div className="wk-asks">
            <p className="wk-who">
              <Avatar person={partner} size={26} />
              <strong>{theirAsks.length || theirs.requestNote ? `${theirName} asked for` : theirName}</strong>
            </p>
            {theirAsks.length === 0 && !theirs.requestNote ? <p className="wk-blank">No requests this week.</p> : null}
            {theirAsks.length > 0 && me.slashSide === "leading" ? (
              <ul className="wk-ask-list">
                {theirAsks.map((id) => {
                  const move = leadMove(id, theirName, waitingTaskId);
                  return (
                    <li key={id}>
                      <span className="wk-patch">{labelOf(id)}</span>
                      {move.hint ? <p className="wk-hint">{move.hint}</p> : null}
                      {move.href && move.label ? (
                        <button className="wk-move" type="button" onClick={() => go(move.href!)}>
                          {move.label}
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {theirAsks.length > 0 && me.slashSide !== "leading" ? (
              <p className="wk-patches">
                {theirAsks.map((id) => <span key={id} className="wk-patch">{labelOf(id)}</span>)}
              </p>
            ) : null}
            {theirs.requestNote ? <p className="wk-words wk-quote">{theirs.requestNote}</p> : null}
          </div>
        ) : null}
        {mine ? (
          <Voice person={me} label={myAsks.length || mine.requestNote ? "You asked for" : "You"} entry={mine}>
            {myAsks.length === 0 && !mine.requestNote ? <p className="wk-blank">No requests this week.</p> : null}
            {myAsks.length > 0 ? (
              <p className="wk-patches">
                {myAsks.map((id) => <span key={id} className="wk-patch">{labelOf(id)}</span>)}
              </p>
            ) : null}
            {mine.requestNote ? <p className="wk-words">{mine.requestNote}</p> : null}
          </Voice>
        ) : null}
      </section>
    </div>
  );
}

function Trend({ weekly }: { weekly: WeeklyData }) {
  const weeks = [
    ...weekly.history.slice(0, 7).reverse().map((item) => ({ week: item.week, ...(item.mine || { selfRating: 0, dynamicRating: 0 }) })),
    ...(weekly.mine ? [{ week: weekly.week, selfRating: weekly.mine.selfRating, dynamicRating: weekly.mine.dynamicRating }] : []),
  ];
  if (weeks.filter((item) => item.selfRating || item.dynamicRating).length < 2) return null;
  return (
    <section className="card wk-trend" aria-label="How your own hearts have moved, week by week">
      <p className="eyebrow">Your hearts, week by week</p>
      <div className="wk-bars" aria-hidden="true">
        {weeks.map((item) => (
          <div key={item.week} className="wk-bar-week">
            <div className="wk-bar-pair">
              {item.selfRating ? <i className="self" style={{ height: `${item.selfRating * 20}%` }} /> : null}
              {item.dynamicRating ? <i className="us" style={{ height: `${item.dynamicRating * 20}%` }} /> : null}
              {!item.selfRating && !item.dynamicRating ? <b>no hearts</b> : null}
            </div>
            <span>{prettyDate(item.week)}</span>
          </div>
        ))}
      </div>
      <p className="fine wk-key">
        <i className="self" /> About myself <i className="us" /> About us
      </p>
    </section>
  );
}

function History({ weekly, partnerName }: { weekly: WeeklyData; partnerName: string }) {
  return (
    <section className="wk-history">
      <h2>Earlier weeks</h2>
      {weekly.history.length === 0 ? (
        <p className="muted">Past weeks collect here, so you can both look back and see how things have moved.</p>
      ) : (
        <div className="stack">
          <Trend weekly={weekly} />
          {weekly.history.map((item) => (
            <button key={item.week} className="task" type="button" onClick={() => go(`/weekly/${item.week}`)}>
              <strong>{weekRange(item.week, item.weekEnd)}</strong>
              <em>
                {item.mine && item.partner
                  ? "Both of you checked in"
                  : item.mine
                    ? `You checked in. ${partnerName} skipped this one.`
                    : `${partnerName} checked in. You skipped this one.`}
              </em>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ThisWeek({ weekly, me, partner }: { weekly: WeeklyData; me: Person; partner: Person }) {
  const { data, request } = useSession();
  const [editing, setEditing] = useState(false);
  const theirName = firstName(partner.displayName);
  const waitingTaskId = data?.tasks.find((task) => task.status === "done" && !task.acknowledgedAt)?.id;
  const writing = !weekly.mine || editing;
  const unread = weekly.state === "both" && !writing ? weekly.unread : "";

  useEffect(() => {
    if (!unread) return;
    void request("/api/weekly/read", { method: "POST" }).catch(() => undefined);
  }, [unread, request]);

  const toTop = () => document.querySelector(".slash .scroll")?.scrollTo({ top: 0 });

  return (
    <Shell nav>
      <div className="pad">
        <PageHead title="Weekly check-in" kicker={`This week · ${weekRange(weekly.week, weekly.weekEnd)}`} />
        {writing ? (
          <>
            <p className="lead">
              A few quiet minutes, once a week. Write as much or as little as you like. Nobody’s grading it, and there are no wrong answers.
            </p>
            <p className="wk-sealed">
              <SealGlyph />
              <span>
                {weekly.mine
                  ? "Change anything you like. It’s yours until the week ends."
                  : weekly.partnerSent
                    ? `${theirName}’s is already in, and sealed. It opens when yours is in too, so nobody writes theirs as a reply.`
                    : `Just between the two of you. Each one stays sealed until you’ve both sent yours, so nobody writes theirs as a reply.`}
              </span>
            </p>
            <CheckinForm
              key={weekly.week}
              weekly={weekly}
              me={me}
              partnerName={theirName}
              onDone={() => { setEditing(false); toTop(); }}
              onCancel={weekly.mine ? () => { clearDraft(me.id, weekly.week); setEditing(false); toTop(); } : undefined}
            />
          </>
        ) : (
          <>
            {weekly.partner ? (
              <p className="lead">Both are in. Read slowly. Talk about it after, if you’d like to.</p>
            ) : (
              <p className="wk-sealed">
                <SealGlyph />
                <span>Yours is in. {theirName} hasn’t sent one yet. When it lands, the two open up side by side.</span>
              </p>
            )}
            <Reading pair={weekly} weekly={weekly} me={me} partner={partner} waitingTaskId={waitingTaskId} />
            <div className="stack tight wk-after">
              <button className="ghost wide" type="button" onClick={() => { setEditing(true); toTop(); }}>
                Change mine
              </button>
              <p className="fine wk-center">Yours stays open for changes until {prettyDate(weekly.weekEnd)}.</p>
            </div>
          </>
        )}
        <History weekly={weekly} partnerName={theirName} />
      </div>
    </Shell>
  );
}

function SealGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="3" fill="#fff" stroke="#b14b6a" strokeWidth="1.6" strokeDasharray="2.4 2" />
      <path d="M12 15.6c-2-1.4-3.1-2.5-3.1-3.8a1.7 1.7 0 0 1 3.1-1 1.7 1.7 0 0 1 3.1 1c0 1.3-1.1 2.4-3.1 3.8z" fill="#ff5a7a" />
    </svg>
  );
}

function PastWeek({ week, weekly, me, partner }: { week: string; weekly: WeeklyData; me: Person; partner: Person }) {
  const { token } = useSession();
  const [pair, setPair] = useState<WeeklyWeek | null>(null);
  const [missing, setMissing] = useState(false);
  const theirName = firstName(partner.displayName);

  useEffect(() => {
    let cancel = false;
    // Asked for directly: a week that is not there is said once, on the page, with no toast on top.
    api(`/api/weekly/${week}`, { token })
      .then((payload) => {
        if (cancel) return;
        const opened = payload.weekly?.opened;
        if (opened) setPair(opened);
        else setMissing(true);
      })
      .catch(() => {
        if (!cancel) setMissing(true);
      });
    return () => {
      cancel = true;
    };
  }, [week, token]);

  const summary = weekly.history.find((item) => item.week === week);
  return (
    <Shell nav>
      <div className="pad">
        <PageHead
          title="Looking back"
          kicker={summary ? weekRange(summary.week, summary.weekEnd) : pair ? weekRange(pair.week, pair.weekEnd) : "An earlier week"}
        />
        {missing ? <p className="lead">There’s no check-in from that week.</p> : null}
        {!pair && !missing ? <p className="lead">One sec…</p> : null}
        {pair ? (
          <>
            {pair.mine && pair.partner ? <p className="lead">Both of you checked in that week.</p> : null}
            {pair.mine && !pair.partner ? (
              <p className="wk-sealed"><SealGlyph /><span>{theirName} skipped this week. Here’s yours.</span></p>
            ) : null}
            {!pair.mine && pair.partner ? (
              <p className="wk-sealed"><SealGlyph /><span>You skipped this week. Here’s {theirName}’s.</span></p>
            ) : null}
            <Reading pair={pair} weekly={weekly} me={me} partner={partner} />
          </>
        ) : null}
        <button className="ghost wide wk-back" type="button" onClick={() => go("/weekly")}>
          Back to this week
        </button>
      </div>
    </Shell>
  );
}

export function Weekly({ week }: { week?: string }) {
  const { data } = useSession();
  const bundle = data!;
  const { me, partner, weekly } = bundle;

  if (!weekly || !weekly.available || !partner) {
    return (
      <Shell nav>
        <div className="pad">
          <PageHead title="Weekly check-in" kicker="For the two of you" />
          <p className="lead">
            Once a week, you each write how you are, how the two of you are, and what you’d like next. Then you read them side by side.
          </p>
          {weekly ? (
            <>
              <p>It opens once you’re paired. It’ll be here.</p>
              <button className="primary" type="button" onClick={() => go("/pair")}>
                {me.slashSide === "leading" ? "Invite your partner" : "Pair up"}
              </button>
            </>
          ) : (
            <p>It isn’t switched on here yet. Check back after the next update.</p>
          )}
        </div>
      </Shell>
    );
  }
  if (week && week !== weekly.week) return <PastWeek key={week} week={week} weekly={weekly} me={me} partner={partner} />;
  return <ThisWeek weekly={weekly} me={me} partner={partner} />;
}
