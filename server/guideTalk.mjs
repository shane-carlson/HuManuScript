/**
 * What a stuffie knows, and what it says about it.
 *
 * `guideFacts` reads one household and one viewer and returns plain facts, all
 * taken from the record: nothing is guessed, and a fact that cannot be derived
 * is left out. `guideSay` turns those facts into a sentence or three in one of
 * the four written voices (guideLines.mjs). The engine only ever hands this
 * module the one household both people share, and an unpaired person only hears
 * about their own things.
 */
import { CATEGORIES, GOAL_OPTIONS, TEMPLATES, guideSpeech, levelFor, templateById } from "./catalog.mjs";
import { progressView } from "./progress.mjs";
import { BEATS, GREETINGS, VOICES } from "./guideLines.mjs";
import { stuffieOf } from "./stuffie.mjs";

const DAY_MS = 86400000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toMs(value) {
  if (value == null || value === "") return null;
  const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function dayMs(day) {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Whole days from `earlier` to `later`. */
function daysBetween(earlier, later) {
  return Math.round((dayMs(later) - dayMs(earlier)) / DAY_MS);
}

function shiftDay(day, days) {
  return new Date(dayMs(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** `clock` is what `new Date().getTimezoneOffset()` gives on the person's phone: minutes behind UTC. */
function clockOf(value) {
  if (value == null || value === "") return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) && Math.abs(minutes) <= 900 ? Math.round(minutes) : null;
}

function localDay(time, clock) {
  return new Date(time - (clock || 0) * 60000).toISOString().slice(0, 10);
}

function firstName(user) {
  return String(user?.displayName || "").trim().split(/\s+/)[0] || "";
}

function person(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: firstName(user),
    role: String(user.roleTitle || "").trim(),
    their: user.pronouns?.possessive || "their",
    them: user.pronouns?.object || "them",
    goals: list(user.goals),
    supplies: list(user.supplies).map((item) => String(item)).filter(Boolean),
  };
}

function longestRun(days) {
  const sorted = [...new Set(days.filter(isDay))].sort();
  let best = 0;
  let run = 0;
  let previous = "";
  for (const day of sorted) {
    run = previous && daysBetween(previous, day) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    previous = day;
  }
  return best;
}

function earnedPoints(task) {
  const picked = new Set(list(task.completion?.bonuses));
  const bonus = list(task.bonuses).filter((item) => picked.has(item.id)).reduce((sum, item) => sum + (Number(item.points) || 0), 0);
  return (Number(task.points) || 0) + bonus;
}

function categoryLabel(id) {
  return CATEGORIES.find((item) => item.id === id)?.label || String(id || "");
}

/**
 * Everything the stuffie may talk about, for this viewer, right now.
 *
 * @param db      one household record
 * @param viewer  the person the stuffie belongs to
 * @param opts    `now` (ms, Date or ISO), `today` (the viewer's YYYY-MM-DD), `tz`
 *                (minutes behind UTC, so times of day can be told), and `extras`:
 *                facts from other features, copied to `facts.extras` as given.
 */
export function guideFacts(db, viewer, opts = {}) {
  const now = toMs(opts.now) ?? Date.now();
  const clock = clockOf(opts.tz) ?? clockOf(viewer?.guideClock);
  const seen = isDay(viewer?.lastSeenDay) && Math.abs(daysBetween(viewer.lastSeenDay, localDay(now, 0))) <= 1 ? viewer.lastSeenDay : "";
  const day = isDay(opts.today) ? opts.today : clock != null ? localDay(now, clock) : seen || localDay(now, 0);
  const yesterday = shiftDay(day, -1);
  const hour = clock != null ? new Date(now - clock * 60000).getUTCHours() : null;
  const part = hour == null ? null : hour < 5 ? "late" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "late";

  const users = list(db?.users);
  const members = list(db?.pair?.members);
  const partnerUser = viewer && members.includes(viewer.id) ? users.find((item) => item && item.id !== viewer.id && members.includes(item.id)) || null : null;
  const side = viewer?.slashSide === "leading" ? "leading" : "following";
  const followerUser = side === "following" ? viewer : partnerUser;
  const leaderUser = side === "leading" ? viewer : partnerUser;
  const paired = Boolean(partnerUser);
  // Before pairing there is no shared history: only the viewer's own things count.
  const own = (id) => paired || id === viewer?.id;

  const tasks = paired && followerUser ? list(db?.tasks).filter((item) => item && item.assignedTo === followerUser.id) : [];
  const doneDay = (task) => (isDay(task.completionDate) ? task.completionDate : toMs(task.completedAt) != null ? localDay(toMs(task.completedAt), clock) : "");
  const item = (task) => ({
    id: task.id,
    title: String(task.title || ""),
    templateId: task.templateId || "",
    category: task.category || "",
    points: earnedPoints(task),
    at: toMs(task.completedAt),
    day: doneDay(task),
    dueDate: isDay(task.dueDate) ? task.dueDate : "",
    daily: Boolean(task.routineId),
    createdAt: toMs(task.createdAt),
    acknowledgedAt: toMs(task.acknowledgedAt),
  });
  const byTime = (a, b) => (a.at ?? 0) - (b.at ?? 0) || String(a.day).localeCompare(String(b.day));

  const finished = tasks.filter((task) => task.status === "done").map(item).sort(byTime);
  // Locking in an adventure closes its sealed card; the tasks behind it are what got done.
  const done = finished.filter((entry) => entry.templateId !== "daily-adventure");
  const doneToday = done.filter((entry) => entry.day && entry.day >= day);
  const doneRecent = done.filter((entry) => entry.day && entry.day >= yesterday);
  // A week runs Monday to Sunday, the same week the progress card and the weekly check-in count.
  const weekStart = shiftDay(day, -((new Date(dayMs(day)).getUTCDay() + 6) % 7));
  const doneWeek = done.filter((entry) => entry.day && entry.day >= weekStart);
  const tally = new Map();
  for (const entry of doneWeek) tally.set(entry.category, (tally.get(entry.category) || 0) + 1);
  const weekByCategory = [...tally].map(([id, count]) => ({ id, label: categoryLabel(id), count })).sort((a, b) => b.count - a.count);
  const last = done.at(-1) || null;

  // The numbers on the Home card come from the progress engine; the stuffie quotes the same ones.
  let shown = null;
  if (paired) {
    try {
      shown = progressView(db, viewer, { today: day, now: new Date(now).toISOString() })?.progress || null;
    } catch {
      shown = null;
    }
  }
  const keptDays = Math.max(0, Math.round(Number(followerUser?.streak) || 0));
  const lastActive = isDay(followerUser?.lastActiveDate) ? followerUser.lastActiveDate : "";
  const gap = lastActive ? daysBetween(lastActive, day) : null;
  const counted = shown?.streak && Number.isFinite(Number(shown.streak.days)) ? Math.max(0, Math.round(Number(shown.streak.days))) : null;
  const live = paired && (counted != null ? counted > 0 : keptDays > 0 && gap != null && gap <= 1);
  // Once a streak has stopped, `days` is how long it ran, so it can still be talked about.
  const streakDays = !paired ? 0 : live && counted != null ? counted : keptDays;
  const best = paired ? Math.max(longestRun(finished.map((entry) => entry.day)), streakDays, Math.round(Number(shown?.streak?.best) || 0)) : 0;
  const streak = {
    days: streakDays,
    live,
    doneToday: live && (counted != null ? Boolean(shown.streak.doneToday) : gap <= 0),
    best,
    isBest: live && streakDays >= 3 && streakDays >= best,
  };

  const total = paired ? Math.max(0, Math.round(Number(followerUser?.points) || 0)) : 0;
  const rank = shown?.level || levelFor(total);
  const climbed = Math.max(0, Math.round(Number(shown?.embers ?? total) || 0));
  const stepLeft = Number(rank?.step?.toNext);
  const points = {
    total,
    embers: paired ? climbed : 0,
    level: paired ? rank?.title || rank?.name || "" : "",
    nextLevel: paired ? rank?.step?.nextTitle || rank?.next || "" : "",
    toNext: !paired ? 0 : Number.isFinite(stepLeft) ? Math.max(0, stepLeft) : rank?.nextMin != null && rank.nextMin > climbed ? rank.nextMin - climbed : 0,
    care: paired ? Math.max(0, Math.round(Number(shown?.care?.points ?? leaderUser?.carePoints) || 0)) : 0,
  };

  const openItems = tasks
    .filter((task) => task.status === "open" && !task.routineId && task.templateId !== "daily-adventure")
    .map((task) => {
      const entry = item(task);
      return { ...entry, overdue: Boolean(entry.dueDate && entry.dueDate < day), dueToday: entry.dueDate === day };
    })
    .sort((a, b) => {
      const rankOf = (entry) => (entry.overdue ? 0 : entry.dueToday ? 1 : entry.dueDate ? 2 : 3);
      return rankOf(a) - rankOf(b) || String(a.dueDate).localeCompare(String(b.dueDate)) || (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
  const newest = openItems.slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] || null;
  const open = {
    items: openItems,
    count: openItems.length,
    next: openItems[0] || null,
    overdue: openItems.filter((entry) => entry.overdue),
    dueToday: openItems.filter((entry) => entry.dueToday),
    adventure: tasks.some((task) => task.status === "open" && task.templateId === "daily-adventure"),
    newest,
  };

  const daily = { total: 0, done: [], left: [], passed: [] };
  let water = null;
  const routines = paired && followerUser ? list(db?.routines).filter((routine) => routine && !routine.stoppedAt && routine.assignedTo === followerUser.id) : [];
  for (const routine of routines) {
    const instances = tasks.filter((task) => task.routineId === routine.id);
    const current = instances.find((task) => task.status === "open")
      || instances.slice().sort((a, b) => String(b.day).localeCompare(String(a.day)))[0];
    if (!current) continue;
    daily.total += 1;
    const entry = item(current);
    const template = templateById(current.templateId);
    const fresh = isDay(current.day) && current.day >= day;
    if (current.status === "done" && fresh) daily.done.push(entry);
    else if (current.status === "skipped" && fresh) daily.passed.push(entry);
    else daily.left.push(entry);
    if (template?.completion === "amount") {
      const target = Number(current.target) || Number(template.amountDefault) || 0;
      const amount = Math.max(0, Number(current.progress?.amount) || 0);
      const stale = current.status === "open" && isDay(current.day) && current.day < yesterday;
      if (target > 0 && !stale) {
        const finishedToday = current.status === "done" && fresh;
        water = { amount: finishedToday ? Math.max(amount, target) : current.status === "open" ? amount : 0, target, unit: template.unit || "", left: 0, done: finishedToday };
        water.left = Math.max(0, target - water.amount);
      }
    }
  }

  const praise = {
    said: finished.filter((entry) => entry.acknowledgedAt != null).length,
    waiting: finished.filter((entry) => entry.acknowledgedAt == null).reverse(),
    latest: finished.filter((entry) => entry.acknowledgedAt != null).sort((a, b) => a.acknowledgedAt - b.acknowledgedAt).at(-1) || null,
  };

  const checkins = list(db?.checkins)
    .filter((note) => note && own(note.fromUserId))
    .map((note) => ({ from: note.fromUserId, kind: note.kind === "grounding" ? "grounding" : "hello", text: String(note.note || ""), at: toMs(note.createdAt), seen: list(note.seenBy).includes(viewer?.id) }))
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const theirs = partnerUser ? checkins.filter((note) => note.from === partnerUser.id).at(-1) || null : null;
  const mine = checkins.filter((note) => note.from === viewer?.id).at(-1) || null;
  const notes = {
    count: checkins.length,
    // The words of a note are only repeated once this viewer has had it on their own screen.
    theirs: theirs ? { kind: theirs.kind, at: theirs.at, seen: theirs.seen, text: theirs.seen ? theirs.text : "" } : null,
    mine: mine ? { kind: mine.kind, at: mine.at } : null,
  };

  const rewardList = list(db?.rewards).filter((reward) => reward && own(reward.proposedBy));
  const reward = (entry, extra = {}) => ({ id: entry.id, title: String(entry.title || ""), cost: Number(entry.cost) || 0, ...extra });
  const agreed = rewardList.filter((entry) => entry.status === "agreed");
  const pending = rewardList.filter((entry) => entry.status === "proposed" || entry.status === "suggested");
  const affordable = agreed.filter((entry) => (Number(entry.cost) || 0) <= total).sort((a, b) => b.cost - a.cost)[0];
  const nearest = agreed.filter((entry) => (Number(entry.cost) || 0) > total).sort((a, b) => a.cost - b.cost)[0];
  const asked = rewardList.find((entry) => entry.status === "requested");
  const granted = rewardList.filter((entry) => entry.status === "granted").sort((a, b) => (toMs(a.grantedAt) ?? 0) - (toMs(b.grantedAt) ?? 0));
  const offer = pending.find((entry) => entry.proposedBy !== viewer?.id && !list(entry.agreedBy).includes(viewer?.id));
  const rewards = {
    ready: paired && affordable ? reward(affordable) : null,
    close: paired && nearest ? reward(nearest, { short: nearest.cost - total }) : null,
    asked: asked ? reward(asked) : null,
    granted: granted.length ? reward(granted.at(-1), { at: toMs(granted.at(-1).grantedAt) }) : null,
    offer: offer ? reward(offer) : null,
    agreedCount: agreed.length,
    grantedCount: granted.length,
  };

  const goalList = list(db?.goals).filter((goal) => goal && own(goal.createdBy) && Number(goal.target) > 0);
  const goalOf = (goal) => ({ id: goal.id, title: String(goal.title || ""), progress: Math.max(0, Number(goal.progress) || 0), target: Number(goal.target) });
  const closest = goalList
    .map(goalOf)
    .filter((goal) => goal.progress > 0 && goal.progress < goal.target)
    .sort((a, b) => b.progress / b.target - a.progress / a.target)[0] || null;
  const goals = { closest, finished: goalList.map(goalOf).filter((goal) => goal.progress >= goal.target) };

  const since = toMs(db?.pair?.createdAt);
  const pair = paired ? { since, days: since != null ? Math.max(0, daysBetween(localDay(since, clock), day)) : null } : null;

  const quietDays = last?.day ? daysBetween(last.day, day) : 0;
  const quiet = last && quietDays >= 2 ? { days: quietDays, since: last.day } : null;

  const facts = {
    now,
    day,
    weekday: WEEKDAYS[new Date(dayMs(day)).getUTCDay()],
    clock,
    hour,
    part,
    side,
    paired,
    me: person(viewer),
    partner: person(partnerUser),
    pair,
    streak,
    points,
    done: {
      today: doneToday,
      recent: doneRecent,
      week: doneWeek,
      weekStart,
      weekByCategory,
      weekPoints: doneWeek.reduce((sum, entry) => sum + entry.points, 0),
      last,
      first: done[0] || null,
      total: done.length,
      latest: finished.at(-1) || null,
    },
    open,
    daily,
    water,
    praise,
    notes,
    rewards,
    goals,
    quiet,
    assign: assignFacts(person(followerUser), tasks, done, day),
    extras: opts.extras && typeof opts.extras === "object" ? { ...opts.extras } : {},
  };
  return facts;
}

/** What has been thin lately, and tasks that would fit: by category, by what they asked for, by what they own. */
function assignFacts(follower, tasks, done, day) {
  if (!follower || !tasks) return { quiet: [], ideas: [] };
  const openTemplates = new Set(tasks.filter((task) => task.status === "open").map((task) => task.templateId));
  const recentTemplates = new Set(done.filter((entry) => entry.day > shiftDay(day, -7)).map((entry) => entry.templateId));
  // A spicy idea only comes up when that category is already part of what they do.
  const spicy = tasks.some((task) => task.category === "spicy");
  const quiet = [];
  for (const id of ["fun", "self-care", "grounding", "spicy"]) {
    if (id === "spicy" && !spicy) continue;
    if (tasks.some((task) => task.status === "open" && task.category === id)) continue;
    const lastDay = done.filter((entry) => entry.category === id).map((entry) => entry.day).sort().at(-1) || "";
    if (lastDay && daysBetween(lastDay, day) < 7) continue;
    quiet.push({ id, label: categoryLabel(id), lastDay });
  }
  quiet.sort((a, b) => Number(Boolean(b.lastDay)) - Number(Boolean(a.lastDay)));
  const owned = follower.supplies.map((entry) => entry.toLowerCase());
  const ideas = TEMPLATES
    .filter((template) => !template.habit && !template.custom && template.completion !== "adventure")
    .filter((template) => !openTemplates.has(template.id) && !recentTemplates.has(template.id))
    .filter((template) => template.category !== "spicy" || spicy)
    .map((template) => {
      const goalKey = list(template.goalKeys).find((key) => follower.goals.includes(key));
      const hint = list(template.supplyHints).find((word) => owned.some((entry) => entry.includes(word) || word.includes(entry)));
      const supply = hint ? follower.supplies[owned.findIndex((entry) => entry.includes(hint) || hint.includes(entry))] : "";
      return {
        templateId: template.id,
        title: template.title,
        category: template.category,
        goal: goalKey ? GOAL_OPTIONS.find((goal) => goal.key === goalKey)?.title || "" : "",
        supply: supply || "",
      };
    });
  return { quiet, ideas };
}

/* ---------- saying it ---------- */

function num(n) {
  return Number.isInteger(n) && n >= 0 && n < NUMBERS.length ? NUMBERS[n] : String(n);
}

function count(n, noun) {
  return `${num(n)} ${noun}${n === 1 ? "" : "s"}`;
}

function times(n) {
  return n === 1 ? "once" : n === 2 ? "twice" : `${num(n)} times`;
}

function quoted(title) {
  return `‘${title}’`;
}

function nameOf(entry, whose) {
  const plain = templateById(entry.templateId)?.title === entry.title;
  if (plain && entry.templateId === "water") return `${whose} water`;
  if (plain && entry.templateId === "meds") return `${whose} meds`;
  return quoted(entry.title);
}

function listed(names, max = 2) {
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] || "";
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  if (max >= unique.length) return `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
  return `${unique.slice(0, max).join(", ")} and ${num(unique.length - max)} more`;
}

function weekdayOf(day) {
  return WEEKDAYS[new Date(dayMs(day)).getUTCDay()];
}

function ago(at, facts, onDay) {
  if (at == null && !onDay) return "";
  const minutes = at != null ? Math.max(0, Math.round((facts.now - at) / 60000)) : null;
  if (minutes != null && minutes < 180) {
    if (minutes < 3) return "just now";
    if (minutes < 20) return "a few minutes ago";
    if (minutes < 50) return "half an hour ago";
    if (minutes < 100) return "an hour ago";
    return "a couple of hours ago";
  }
  const day = onDay || localDay(at, facts.clock);
  const days = Math.max(0, daysBetween(day, facts.day));
  if (days === 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `on ${weekdayOf(day)}`;
  if (days < 14) return "last week";
  if (days < 60) return `${num(Math.floor(days / 7))} weeks ago`;
  return `${num(Math.round(days / 30))} months ago`;
}

function since(day, facts) {
  const days = daysBetween(day, facts.day);
  if (days <= 1) return "since yesterday";
  if (days < 7) return `since ${weekdayOf(day)}`;
  if (days < 14) return "since last week";
  if (days < 60) return `for ${num(Math.floor(days / 7))} weeks`;
  return `for ${num(Math.round(days / 30))} months`;
}

function span(days) {
  if (days < 2) return "a day";
  if (days < 7) return `${num(days)} days`;
  if (days < 14) return "a week";
  if (days < 60) return `${num(Math.floor(days / 7))} weeks`;
  if (days < 365) return `${num(Math.round(days / 30))} months`;
  const years = Math.floor(days / 365);
  return years === 1 ? "a year" : `${num(years)} years`;
}

function clip(text, max = 90) {
  const clean = String(text || "").replace(/\s+/g, " ").replace(/[“”"]/g, "’").trim();
  if (!clean) return "";
  if (clean.length <= max) return /[.!?…]$/.test(clean) ? clean : `${clean}.`;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[\s,;:.!?]+$/, "")}…`;
}

function hash(text) {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) value = (value * 33 + text.charCodeAt(index)) >>> 0;
  return value;
}

function minutesSince(at, facts) {
  return at == null ? Infinity : (facts.now - at) / 60000;
}

/** The newest thing to have happened between them: a well done, a finished task, or a new task. The newest goes first. */
function latestNews(facts) {
  const events = [
    ["praise", facts.praise.latest?.acknowledgedAt],
    ["done", facts.done.latest?.at],
    ["task", facts.open.newest?.createdAt],
  ].filter((event) => event[1] != null);
  events.sort((a, b) => b[1] - a[1]);
  return events[0]?.[0] || "";
}

function daysSince(at, facts) {
  return at == null ? Infinity : daysBetween(localDay(at, facts.clock), facts.day);
}

/** Every word a line may borrow. A value left empty means lines that need it are skipped. */
function wordsFor(facts, tick = 0) {
  const f = facts;
  const following = f.side === "following";
  const whose = following ? "your" : f.partner?.their || "their";
  const name = (entry) => nameOf(entry, whose);
  const names = (entries, max) => listed(entries.map(name), max);
  // On its own a task goes by its title, so the verb after it never has to guess at "meds is" or "meds are".
  const title = (entry) => quoted(entry.title);
  const pick = (items) => (items.length ? items[Math.abs(tick) % items.length] : null);

  const today = f.done.today;
  let whenDone = "today";
  if (today.length && minutesSince(today.at(-1).at, f) <= 30) whenDone = "just now";
  else if (today.length && f.hour != null) {
    const hours = today.map((entry) => (entry.at != null ? new Date(entry.at - f.clock * 60000).getUTCHours() : 12));
    if (hours.every((hour) => hour >= 5 && hour < 12)) whenDone = f.hour >= 12 ? "before lunch" : f.hour >= 5 ? "already this morning" : "today";
    else if (hours.every((hour) => hour >= 17) && f.hour >= 17) whenDone = "this evening";
  }
  const recentToday = f.done.recent.length > 0 && f.done.recent.every((entry) => entry.day >= f.day);

  // The tasks they were given on purpose are more worth naming than the daily ticks.
  const weekNamed = f.done.week.slice().sort((a, b) => Number(a.daily) - Number(b.daily) || (b.at ?? 0) - (a.at ?? 0));
  const weekNames = [...new Set(weekNamed.map(name))];
  const weekSaid = f.done.week.length === 0 ? ""
    : weekNames.length <= 2 && f.done.week.length <= 2 ? listed(weekNames)
      : `${count(f.done.week.length, "thing")}, including ${listed(weekNames.slice(0, 2))}`;
  const top = f.done.weekByCategory[0];
  const topCat = top && top.count >= 2 && top.count * 2 >= f.done.week.length ? top.label.toLowerCase() : "";

  const next = f.open.next;
  const overdueDays = next?.overdue ? daysBetween(next.dueDate, f.day) : 0;
  const dueDays = next?.dueDate && !next.overdue ? daysBetween(f.day, next.dueDate) : 0;
  const dueDate = next?.dueDate ? new Date(dayMs(next.dueDate)) : null;

  const waiting = f.praise.waiting;
  const leftToday = [...f.daily.left, ...f.open.dueToday];
  const todo = f.open.count + f.daily.left.length + (f.open.adventure ? 1 : 0);

  const ideas = f.assign.ideas;
  const quietCat = f.assign.quiet.find((entry) => ideas.some((idea) => idea.category === entry.id)) || null;
  const quietIdea = quietCat ? pick(ideas.filter((idea) => idea.category === quietCat.id)) : null;
  // Spicy tasks are theirs to bring up. The stuffie only ever points at one when that is the category gone quiet.
  const goalIdea = pick(ideas.filter((idea) => idea.goal && idea.category !== "spicy"));
  const supplyIdea = pick(ideas.filter((idea) => idea.supply && idea.category !== "spicy"));

  const note = f.notes.theirs;
  const cheer = f.extras.cheer;

  return {
    name: f.me?.name || "you",
    partner: f.partner?.name || "",
    role: f.partner ? f.me?.role || "" : "",
    partnerRole: f.partner?.role || "",
    yourLead: following && f.partner?.role ? `your ${f.partner.role}` : "",
    their: f.partner?.their || "",
    them: f.partner?.them || "",
    weekday: f.weekday,
    streak: f.streak.days >= 2 ? num(f.streak.days) : "",
    streakDays: f.streak.days >= 2 ? count(f.streak.days, "day") : "",
    streakNext: f.streak.days >= 1 ? num(f.streak.days + 1) : "",
    best: f.streak.best >= 2 ? count(f.streak.best, "day") : "",
    doneToday: names(today, 2),
    doneTodayN: today.length ? count(today.length, "thing") : "",
    whenDone,
    doneRecent: names(f.done.recent, 2),
    doneRecentN: f.done.recent.length ? count(f.done.recent.length, "thing") : "",
    sinceWhen: recentToday ? "today" : f.done.recent.every((entry) => entry.day < f.day) ? "yesterday" : "since yesterday",
    weekSaid,
    weekN: f.done.week.length ? count(f.done.week.length, "thing") : "",
    weekPoints: f.done.weekPoints > 0 ? String(f.done.weekPoints) : "",
    topCat,
    last: f.done.last ? title(f.done.last) : "",
    lastAgo: f.done.last ? ago(f.done.last.at, f, f.done.last.day) : "",
    quietSince: f.quiet ? since(f.quiet.since, f) : "",
    next: next ? title(next) : "",
    nextWas: !next?.overdue ? "" : overdueDays === 1 ? "yesterday" : overdueDays < 7 ? weekdayOf(next.dueDate) : overdueDays < 14 ? "last week" : "a while back",
    nextDue: !dueDate || next.overdue || dueDays < 1 ? "" : dueDays === 1 ? "tomorrow" : dueDays < 7 ? weekdayOf(next.dueDate) : `${MONTHS[dueDate.getUTCMonth()]} ${dueDate.getUTCDate()}`,
    openN: !following && f.open.count ? count(f.open.count, "task") : todo ? count(todo, "task") : "",
    dailyLeft: names(f.daily.left, 3),
    leftToday: names(leftToday, 2),
    water: f.water && !f.water.done && f.water.amount > 0 ? `${f.water.amount} of ${f.water.target} ${f.water.unit}`.trim() : "",
    waterLeft: f.water && f.water.left > 0 ? `${f.water.left} ${f.water.unit}`.trim() : "",
    waiting: names(waiting, 2),
    praised: f.praise.latest ? title(f.praise.latest) : "",
    praisedAgo: f.praise.latest ? ago(f.praise.latest.acknowledgedAt, f) : "",
    ackN: f.praise.said ? times(f.praise.said) : "",
    note: note?.text ? clip(note.text) : "",
    noteAgo: note ? ago(note.at, f) : "",
    myNoteSince: !f.notes.mine ? "yet" : daysSince(f.notes.mine.at, f) >= 1 ? since(localDay(f.notes.mine.at, f.clock), f) : "",
    rewardReady: f.rewards.ready ? quoted(f.rewards.ready.title) : "",
    rewardClose: f.rewards.close ? quoted(f.rewards.close.title) : "",
    rewardShort: f.rewards.close ? `${f.rewards.close.short} more point${f.rewards.close.short === 1 ? "" : "s"}` : "",
    rewardAsked: f.rewards.asked ? quoted(f.rewards.asked.title) : "",
    rewardGranted: f.rewards.granted ? quoted(f.rewards.granted.title) : "",
    grantedAgo: f.rewards.granted ? ago(f.rewards.granted.at, f) : "",
    rewardOffer: f.rewards.offer ? quoted(f.rewards.offer.title) : "",
    level: f.points.level,
    nextLevel: f.points.nextLevel,
    toNext: f.points.toNext > 0 && f.points.nextLevel ? `${f.points.toNext} ${f.points.toNext === 1 ? "ember" : "embers"}` : "",
    points: f.points.total > 0 ? String(f.points.total) : "",
    care: f.points.care > 0 ? String(f.points.care) : "",
    goal: f.goals.closest ? quoted(f.goals.closest.title) : "",
    goalProgress: f.goals.closest ? String(f.goals.closest.progress) : "",
    goalTarget: f.goals.closest ? String(f.goals.closest.target) : "",
    paired: f.pair?.days ? span(f.pair.days) : "",
    totalDone: f.done.total ? num(f.done.total) : "",
    first: f.done.first ? title(f.done.first) : "",
    newTask: f.open.newest ? title(f.open.newest) : "",
    quietCat: quietCat ? quietCat.label.toLowerCase() : "",
    quietCatSince: !quietCat ? "" : quietCat.lastDay ? since(quietCat.lastDay, f) : "yet",
    suggestQuiet: quietIdea ? quoted(quietIdea.title) : "",
    suggestGoal: goalIdea ? quoted(goalIdea.title) : "",
    partnerGoal: goalIdea ? quoted(goalIdea.goal) : "",
    suggestSupply: supplyIdea ? quoted(supplyIdea.title) : "",
    supply: supplyIdea ? quoted(supplyIdea.supply) : "",
    what: f.done.latest ? title(f.done.latest) : "",
    praiseWhat: cheer?.what?.length ? listed(cheer.what.map(quoted), 2) : "",
    ...(f.extras.words && typeof f.extras.words === "object" ? f.extras.words : {}),
  };
}

/** When each situation is true. A beat with no entry here is never said. */
const WHEN = {
  "f.unpaired": (f) => !f.paired,
  "f.fresh": (f) => f.paired && f.done.total === 0 && todoCount(f) === 0,
  "f.fresh.open": (f) => f.paired && f.done.total === 0 && todoCount(f) > 0,
  "f.note.new": (f) => Boolean(f.notes.theirs) && !f.notes.theirs.seen,
  "f.note.here": (f) => Boolean(f.notes.theirs) && !f.notes.theirs.seen,
  "f.note.said": (f) => Boolean(f.notes.theirs?.text) && daysSince(f.notes.theirs.at, f) <= 3,
  "f.done.unpraised": (f) => f.done.today.length > 0 && f.done.today.every((entry) => entry.acknowledgedAt == null),
  "f.done.praised": (f) => f.done.today.length > 0 && f.done.today.every((entry) => entry.acknowledgedAt != null),
  "f.done.today": (f) => f.done.today.length > 0,
  "f.done.last": (f) => Boolean(f.done.last) && f.done.today.length === 0,
  "f.praise.waiting": (f) => f.praise.waiting.length > 0 && daysSince(f.praise.waiting[0].at, f) <= 3,
  "f.praise.fresh": (f) => Boolean(f.praise.latest) && minutesSince(f.praise.latest.acknowledgedAt, f) <= 180 && latestNews(f) === "praise",
  "f.praise.got": (f) => Boolean(f.praise.latest) && daysSince(f.praise.latest.acknowledgedAt, f) <= 2,
  "f.praise.count": (f) => f.praise.said >= 2,
  "f.streak.going": (f) => f.streak.live && f.streak.days >= 2 && f.streak.doneToday,
  "f.streak.risk": (f) => f.streak.live && f.streak.days >= 2 && !f.streak.doneToday,
  "f.streak.dayone": (f) => f.streak.live && f.streak.days === 1 && f.streak.doneToday,
  "f.streak.yesterday": (f) => f.streak.live && f.streak.days === 1 && !f.streak.doneToday,
  "f.streak.lapsed": (f) => !f.streak.live && f.streak.days >= 2,
  "f.streak.none": (f) => f.streak.days === 0 || (!f.streak.live && f.streak.days === 1),
  "f.best.is": (f) => f.streak.isBest,
  "f.best.below": (f) => f.streak.best >= 3 && f.streak.best > f.streak.days,
  "f.next.overdue": (f) => Boolean(f.open.next?.overdue),
  "f.next.today": (f) => Boolean(f.open.next?.dueToday),
  "f.next.soon": (f) => Boolean(f.open.next?.dueDate) && !f.open.next.overdue && !f.open.next.dueToday,
  "f.next.undated": (f) => Boolean(f.open.next) && !f.open.next.dueDate,
  "f.adventure": (f) => f.open.adventure,
  "f.daily.left": (f) => f.daily.left.length > 0,
  "f.daily.done": (f) => f.daily.total > 0 && f.daily.left.length === 0 && f.daily.done.length > 0,
  "f.water.some": (f) => Boolean(f.water) && !f.water.done && f.water.amount > 0 && f.water.left > 0,
  "f.water.none": (f) => Boolean(f.water) && !f.water.done && f.water.amount === 0,
  "f.week.done": (f) => f.done.week.length > 0,
  "f.week.cat": (f) => f.done.week.length >= 3,
  "f.week.points": (f) => f.done.week.length >= 2 && f.done.weekPoints > 0,
  "f.week.none": (f) => f.done.week.length === 0 && Boolean(f.done.last),
  "f.quiet": (f) => Boolean(f.quiet),
  "f.reward.ready": (f) => Boolean(f.rewards.ready),
  "f.reward.close": (f) => Boolean(f.rewards.close) && f.rewards.close.short <= 25,
  "f.reward.far": (f) => Boolean(f.rewards.close) && f.rewards.close.short > 25,
  "f.reward.asked": (f) => Boolean(f.rewards.asked),
  "f.reward.granted": (f) => Boolean(f.rewards.granted) && daysSince(f.rewards.granted.at, f) <= 14,
  "f.reward.offer": (f) => Boolean(f.rewards.offer),
  "f.reward.none": (f) => f.paired && !f.rewards.ready && !f.rewards.close && !f.rewards.asked && !f.rewards.offer,
  "f.level.next": (f) => f.points.total > 0 && f.points.toNext > 0 && f.points.toNext <= 30,
  "f.level.now": (f) => f.points.total > 0 && Boolean(f.points.level),
  "f.task.fresh": (f) => Boolean(f.open.newest) && f.done.total > 0 && minutesSince(f.open.newest.createdAt, f) <= 360 && latestNews(f) === "task",
  "f.task.new": (f) => Boolean(f.open.newest) && f.done.total > 0 && minutesSince(f.open.newest.createdAt, f) <= 360,
  "f.clear": (f) => f.paired && f.done.total > 0 && todoCount(f) === 0,
  "f.totals": (f) => f.done.total >= 3,
  "f.nice.week": (f) => f.done.week.length >= 2,
  "f.nice.streak": (f) => f.streak.live && f.streak.days >= 3,
  "f.nice.praised": (f) => Boolean(f.praise.latest),
  "f.nice.last": (f) => Boolean(f.done.last),
  "f.nice.plain": () => true,

  "l.unpaired": (f) => !f.paired,
  "l.fresh": (f) => f.paired && f.done.total === 0 && todoCount(f) === 0,
  "l.fresh.open": (f) => f.paired && f.done.total === 0 && todoCount(f) > 0,
  "l.note.care": (f) => f.notes.theirs?.kind === "grounding" && daysSince(f.notes.theirs.at, f) <= 1,
  "l.note.new": (f) => Boolean(f.notes.theirs) && !f.notes.theirs.seen,
  "l.note.here": (f) => Boolean(f.notes.theirs) && !f.notes.theirs.seen,
  "l.note.said": (f) => Boolean(f.notes.theirs?.text) && daysSince(f.notes.theirs.at, f) <= 3,
  "l.note.quiet": (f) => f.paired && f.done.total > 0 && (!f.notes.mine || daysSince(f.notes.mine.at, f) >= 4),
  "l.done.owed": (f) => f.done.recent.length > 0 && f.praise.waiting.length > 0,
  "l.done.recent": (f) => f.done.recent.length > 0,
  "l.owed": (f) => f.praise.waiting.length > 0,
  "l.owed.none": (f) => f.praise.waiting.length === 0 && f.praise.said > 0,
  "l.praised.just": (f) => Boolean(f.praise.latest) && minutesSince(f.praise.latest.acknowledgedAt, f) <= 10 && latestNews(f) === "praise",
  "l.assigned.just": (f) => Boolean(f.open.newest) && minutesSince(f.open.newest.createdAt, f) <= 10 && latestNews(f) === "task",
  "l.streak.going": (f) => f.streak.live && f.streak.days >= 2 && f.streak.doneToday,
  "l.streak.risk": (f) => f.streak.live && f.streak.days >= 2 && !f.streak.doneToday,
  "l.streak.lapsed": (f) => !f.streak.live && f.streak.days >= 2,
  "l.streak.none": (f) => f.paired && f.streak.days < 2,
  "l.best.is": (f) => f.streak.isBest,
  "l.best.below": (f) => f.streak.best >= 3 && f.streak.best > f.streak.days,
  "l.open": (f) => f.open.count > 0,
  "l.overdue": (f) => Boolean(f.open.next?.overdue),
  "l.empty": (f) => f.paired && f.done.total > 0 && todoCount(f) === 0,
  "l.daily.left": (f) => f.daily.left.length > 0,
  "l.daily.done": (f) => f.daily.total > 0 && f.daily.left.length === 0 && f.daily.done.length > 0,
  "l.water": (f) => Boolean(f.water) && !f.water.done && f.water.amount > 0,
  "l.week.done": (f) => f.done.week.length > 0,
  "l.week.cat": (f) => f.done.week.length >= 3,
  "l.quiet": (f) => Boolean(f.quiet),
  "l.reward.asked": (f) => Boolean(f.rewards.asked),
  "l.reward.offer": (f) => Boolean(f.rewards.offer),
  "l.reward.close": (f) => Boolean(f.rewards.close) && f.rewards.close.short <= 25,
  "l.reward.ready": (f) => Boolean(f.rewards.ready),
  "l.care": (f) => f.points.care > 0,
  "l.level": (f) => f.points.total > 0 && f.points.toNext > 0,
  "l.totals": (f) => f.done.total >= 3,
  "l.praise.count": (f) => f.praise.said >= 2,
  "l.assign.full": (f) => f.open.count >= 5,
  "l.assign.owed": (f) => f.praise.waiting.length > 0,
  "l.assign.quiet": (f) => f.paired,
  "l.assign.goal": (f) => f.paired,
  "l.assign.supply": (f) => f.paired,
  "l.assign.lately": (f) => f.done.week.length >= 3,
  "l.assign.tip": (f) => f.paired,
  "l.waiting.none": (f) => f.paired,
  "l.nice.led": (f) => f.praise.said >= 2,
  "l.nice.partner": (f) => f.paired,
  "l.nice.week": (f) => f.done.week.length >= 3 && f.praise.said >= 1,
  "l.nice.streak": (f) => f.streak.live && f.streak.days >= 3,
  "l.nice.plain": () => true,

  "g.goal": (f) => Boolean(f.goals.closest),
  "g.paired": (f) => f.paired && f.pair?.days >= 1,
  "g.paired.today": (f) => f.paired && f.pair?.days === 0,
  "g.roles": (f) => f.paired,
  "g.ground": () => true,
  "g.ground.page": () => true,
  "g.ground.partner": (f) => f.paired,

  "m.done": (f) => Boolean(f.done.latest),
  "m.locked": () => true,
  "m.streak": (f) => Boolean(f.done.latest) && f.streak.days >= 2,
  "m.level": (f) => Boolean(f.done.latest) && Boolean(f.points.level),
  "m.tail.first": (f) => f.done.total === 1,
  "m.tail.streak": (f) => f.streak.days >= 2 && f.done.today.length === 1,
  "m.tail.left": (f) => f.daily.left.length + f.open.dueToday.length > 0,
  "m.tail.cleared": (f) => f.done.today.length >= 2 && todoCount(f) === 0,
  "m.tail.partner": (f) => f.paired,
  "m.tail.level": (f) => f.points.toNext > 0,
  "m.praise": (f) => f.paired,
  "m.reward": (f) => f.paired,
  "m.granted": (f) => f.paired,
  "m.pair": () => true,
};

/** Beats that borrow another beat's lines. */
const SAME_LINES = { "f.praise.fresh": "f.praise.got", "f.task.fresh": "f.task.new" };

function todoCount(f) {
  return f.open.count + f.daily.left.length + (f.open.adventure ? 1 : 0);
}

const STREAK_F = ["f.streak.going", "f.streak.risk", "f.streak.dayone", "f.streak.yesterday", "f.streak.lapsed", "f.streak.none"];
const STREAK_L = ["l.streak.going", "l.streak.risk", "l.streak.lapsed", "l.streak.none"];
const DONE_F = ["f.done.unpraised", "f.done.praised", "f.done.today"];
const NEXT_F = ["f.next.overdue", "f.next.today", "f.adventure", "f.daily.left", "f.next.soon", "f.next.undated"];

/**
 * What each question draws on. A plan is a list of slots; each slot adds at most
 * one sentence (`all` adds several). A plain list takes the first beat that is
 * true right now; `any` turns through the true ones as the tick moves, so asking
 * again gets a different answer.
 */
// A new note is the whole greeting: it sends the reader down the page, so nothing else competes with it.
const afterNote = (facts, used) => !used.some((id) => id.includes(".note."));

const PLANS = {
  following: {
    home: {
      greet: true,
      cap: 140,
      slots: [
        ["f.unpaired", "f.fresh", "f.fresh.open", "f.note.here", "f.praise.fresh", "f.task.fresh", ...DONE_F, "f.next.overdue", "f.task.new", "f.streak.risk", "f.streak.yesterday", "f.reward.ready", "f.next.today", "f.adventure", "f.daily.left", "f.quiet", "f.praise.got", "f.next.soon", "f.next.undated", "f.clear", "f.nice.plain"],
        { when: afterNote, ids: ["f.next.overdue", "f.daily.left", "f.next.today", "f.adventure", "f.streak.risk", "f.reward.ready", "f.streak.going"] },
      ],
    },
    nudge: {
      cap: 190,
      slots: [
        { any: ["f.unpaired", "f.fresh", "f.fresh.open", "f.note.new", "f.task.new", "f.next.overdue", "f.next.today", "f.adventure", "f.daily.left", "f.daily.done", "f.water.some", "f.water.none", ...STREAK_F.slice(0, 5), "f.praise.waiting", "f.praise.got", "f.reward.ready", "f.reward.close", "f.reward.asked", "f.reward.offer", "f.week.done", "f.level.next", "g.goal", "f.note.said", "f.next.soon", "f.next.undated", "f.quiet", "f.clear", "f.nice.plain"] },
      ],
    },
    status: {
      slots: [
        ["f.unpaired", "f.fresh", "f.fresh.open", ...STREAK_F],
        [...DONE_F, "f.quiet", "f.week.done", "f.done.last"],
        { any: ["f.note.new", "f.reward.ready", "f.reward.close", "f.reward.asked", "f.daily.done", "g.goal", "f.level.next", "f.praise.got", "f.level.now"] },
      ],
    },
    week: {
      slots: [
        ["f.unpaired", "f.week.done", "f.week.none", "f.fresh.open", "f.fresh"],
        ["f.week.cat"],
        { any: ["f.week.points", "f.praise.count", "f.streak.going", "f.streak.risk"] },
      ],
    },
    next: {
      slots: [
        ["f.unpaired", ...NEXT_F, "f.clear", "f.fresh"],
        { any: ["f.daily.left", "f.daily.done", "f.water.some", "f.water.none", "f.adventure", "f.next.today", "f.next.soon", "f.next.undated"] },
      ],
    },
    streak: {
      slots: [
        ["f.unpaired", ...STREAK_F],
        ["f.best.is", "f.best.below"],
        { when: (f) => !f.streak.doneToday, ids: ["f.next.today", "f.daily.left", "f.adventure", "f.next.undated"] },
      ],
    },
    nice: { slots: [{ any: ["f.nice.week", "f.nice.streak", "f.nice.praised", "f.nice.last"], spare: ["f.nice.plain"] }] },
    us: {
      slots: [
        ["f.unpaired"],
        { any: ["g.paired", "g.paired.today", "g.roles", "f.totals", "f.praise.count", "f.note.said", "g.goal", "f.reward.granted", "f.fresh"], take: 2 },
      ],
    },
    rewards: {
      slots: [
        ["f.unpaired", "f.reward.ready", "f.reward.asked", "f.reward.close", "f.reward.far", "f.reward.offer", "f.reward.none"],
        { any: ["f.reward.granted", "f.level.next", "f.level.now", "f.reward.offer"] },
      ],
    },
    ground: { slots: [["g.ground"], { any: ["g.ground.partner", "g.ground.page"] }] },
    done: {
      slots: [
        ["f.unpaired", ...DONE_F, "f.done.last", "f.fresh.open", "f.fresh"],
        ["f.streak.going", "f.daily.left", "f.streak.risk"],
      ],
    },
  },
  leading: {
    home: {
      greet: true,
      cap: 140,
      slots: [
        ["l.unpaired", "l.fresh", "l.fresh.open", "l.note.care", "l.note.here", "l.praised.just", "l.assigned.just", "l.done.owed", "l.owed", "l.reward.asked", "l.done.recent", "l.overdue", "l.empty", "l.streak.risk", "l.quiet", "l.reward.offer", "l.streak.going", "l.open", "l.nice.plain"],
        { when: (facts, used) => used.includes("l.assigned.just"), ids: ["l.done.recent", "l.open"] },
        { when: afterNote, ids: ["l.owed", "l.reward.asked", "l.empty", "l.streak.risk", "l.streak.going"] },
      ],
    },
    nudge: {
      cap: 190,
      slots: [
        { any: ["l.unpaired", "l.fresh", "l.fresh.open", "l.owed", "l.reward.asked", "l.reward.offer", "l.note.care", "l.done.recent", ...STREAK_L.slice(0, 3), "l.overdue", "l.empty", "l.open", "l.daily.left", "l.daily.done", "l.water", "l.note.quiet", "l.assign.quiet", "l.assign.supply", "l.assign.goal", "l.reward.close", "l.reward.ready", "l.level", "l.care", "l.week.done", "g.goal", "l.note.said", "l.assign.tip", "l.quiet", "l.nice.plain"] },
      ],
    },
    status: {
      slots: [
        ["l.unpaired", "l.fresh", "l.fresh.open", "l.quiet", "l.week.done", "l.done.recent"],
        STREAK_L,
        { any: ["l.owed", "l.owed.none", "g.goal", "l.care", "g.paired"] },
      ],
    },
    partner: {
      slots: [
        ["l.unpaired", "l.fresh", "l.fresh.open", "l.note.care", "l.done.recent", "l.quiet"],
        ["l.overdue", "l.daily.left", "l.daily.done", "l.open", "l.empty"],
        { any: ["l.water", "l.level", "l.streak.risk", "l.streak.going", "l.note.said"] },
      ],
    },
    assign: {
      slots: [
        ["l.unpaired", "l.assign.full", "l.assign.owed"],
        { any: ["l.assign.quiet", "l.assign.supply", "l.assign.goal", "l.assign.lately"] },
        ["l.assign.tip"],
      ],
    },
    waiting: {
      slots: [
        ["l.unpaired"],
        { all: ["l.owed", "l.reward.asked", "l.reward.offer", "l.note.new", "l.note.care", "l.overdue", "l.empty"] },
        { when: (f, used) => used.length === 0, ids: ["l.waiting.none"] },
      ],
    },
    streak: { slots: [["l.unpaired", ...STREAK_L], ["l.best.is", "l.best.below"], { when: (f) => !f.streak.doneToday, ids: ["l.daily.left", "l.open", "l.empty"] }] },
    nice: { slots: [{ any: ["l.nice.led", "l.nice.partner", "l.nice.week", "l.nice.streak"], spare: ["l.nice.plain"] }] },
    us: {
      slots: [
        ["l.unpaired"],
        { any: ["g.paired", "g.paired.today", "g.roles", "l.totals", "l.praise.count", "l.note.said", "g.goal", "l.care", "l.fresh"], take: 2 },
      ],
    },
    week: { slots: [["l.unpaired", "l.week.done", "l.quiet", "l.fresh.open", "l.fresh"], ["l.week.cat"], { any: ["l.owed", "l.owed.none", "l.streak.going"] }] },
    next: { slots: [["l.unpaired", "l.overdue", "l.open", "l.empty", "l.fresh"], ["l.daily.left", "l.daily.done"]] },
    rewards: { slots: [["l.unpaired", "l.reward.asked", "l.reward.offer", "l.reward.ready", "l.reward.close", "l.level", "l.care", "l.nice.plain"]] },
    ground: { slots: [["g.ground"], { any: ["g.ground.partner", "g.ground.page"] }] },
    done: { slots: [["l.unpaired", "l.done.owed", "l.done.recent", "l.quiet", "l.fresh.open", "l.fresh"], ["l.streak.going", "l.streak.risk"]] },
  },
};

/** Room for two or three sentences in the chat; the Home bubble sets its own, shorter. */
const ASK_CAP = 220;

/** What the Home bubble and the older chat buttons used to send. */
const OLD_EVENTS = { home: "home", done: "done", streak: "streak", ground: "ground", nudge: "nudge", assign: "assign" };

/** The questions each side can ask, in the order the chat page offers them. */
export const GUIDE_TOPICS = {
  following: ["status", "week", "next", "streak", "rewards", "us", "nice", "ground"],
  leading: ["status", "partner", "assign", "waiting", "streak", "us", "nice", "ground"],
};

const MOMENT_BEATS = ["m.done", "m.locked", "m.streak", "m.level", "m.tail.first", "m.tail.streak", "m.tail.left", "m.tail.cleared", "m.tail.partner", "m.tail.level", "m.praise", "m.reward", "m.granted", "m.pair"];

/** Every beat some question or moment can reach, and that has a condition. Lines outside this list are never said. */
export function guideBeatIds() {
  const ids = new Set(MOMENT_BEATS);
  for (const side of Object.values(PLANS)) {
    for (const plan of Object.values(side)) {
      for (const slot of plan.slots) {
        const spec = Array.isArray(slot) ? { ids: slot } : slot;
        for (const id of [...(spec.ids || []), ...(spec.any || []), ...(spec.all || []), ...(spec.spare || [])]) ids.add(SAME_LINES[id] || id);
      }
    }
  }
  return [...ids].filter((id) => typeof WHEN[id] === "function" || Object.values(SAME_LINES).includes(id));
}

function fill(template, words) {
  let missing = false;
  const text = template.replace(/\{(\w+)\}/g, (match, key, offset) => {
    const value = words[key];
    if (value == null || value === "") {
      missing = true;
      return "";
    }
    const opens = offset === 0 || /[.!?]\s$/.test(template.slice(0, offset));
    const word = String(value);
    return opens ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  });
  return missing ? null : text;
}

function linesOf(id, voice, extraBeats) {
  const beat = BEATS[SAME_LINES[id] || id] || extraBeats?.[id];
  if (!beat) return [];
  const lines = Array.isArray(beat) ? beat : beat[voice] || beat.all || [];
  return list(lines);
}

function sayBeat(id, voice, words, turn, extraBeats) {
  const lines = linesOf(id, voice, extraBeats);
  for (let index = 0; index < lines.length; index += 1) {
    const text = fill(lines[(turn + index) % lines.length], words);
    if (text) return text;
  }
  return null;
}

/** Beats of one family say the same kind of thing, so only one of them goes in a reply. */
function group(id) {
  if (id.startsWith("l.assign.") || id.startsWith("g.ground")) return id;
  return id.split(".").slice(0, 2).join(".");
}

/** Extra beats another feature handed in: `{ id, topics, sides, lines: { lumen: [...], ... } | [...] }`. */
function extraBeatsFor(facts, topic) {
  const beats = {};
  const ids = [];
  for (const beat of list(facts.extras.beats)) {
    if (!beat || typeof beat.id !== "string" || !beat.lines) continue;
    if (Array.isArray(beat.sides) && !beat.sides.includes(facts.side)) continue;
    beats[beat.id] = Array.isArray(beat.lines) ? { all: beat.lines } : beat.lines;
    if (!Array.isArray(beat.topics) || beat.topics.includes(topic)) ids.push(beat.id);
  }
  return { beats, ids };
}

function compose(facts, voice, topic, tick, skipKey) {
  const side = facts.side === "leading" ? "leading" : "following";
  const plan = PLANS[side][topic] || PLANS[side].nudge;
  const words = wordsFor(facts, tick);
  const extra = extraBeatsFor(facts, topic);
  const used = [];
  const said = [];
  const truthful = (id) => (WHEN[id] ? WHEN[id](facts, used) : Boolean(extra.beats[id]));
  const free = (id) => !used.some((other) => other === id || group(other) === group(id));
  const add = (id, turn) => {
    const text = sayBeat(id, voice, words, turn, extra.beats);
    if (!text) return false;
    used.push(id);
    said.push(text);
    return true;
  };
  const max = plan.max || 3;
  const skipGroup = skipKey ? group(SAME_LINES[skipKey] || skipKey) : "";

  plan.slots.forEach((slot, position) => {
    if (said.length >= max || used.some((id) => id.endsWith(".unpaired"))) return;
    const spec = Array.isArray(slot) ? { ids: slot } : slot;
    if (spec.when && !spec.when(facts, used)) return;
    const pool = (spec.ids || spec.any || spec.all || []).filter((id) => truthful(id) && free(id));
    // Something general only fills in when there is little of their own to say.
    if (spec.spare && pool.length < 2) pool.push(...spec.spare.filter((id) => truthful(id) && free(id)));
    if (position === plan.slots.length - 1 && spec.any) pool.push(...extra.ids.filter((id) => free(id)));
    if (!pool.length) return;
    if (spec.all) {
      for (const id of pool) if (said.length < max) add(id, tick);
      return;
    }
    const start = spec.any ? Math.abs(tick) % pool.length : 0;
    // Asked again, it moves to another subject, or, where the question has only one, to another beat.
    const elsewhere = pool.some((id) => group(SAME_LINES[id] || id) !== skipGroup);
    const repeats = (id) => Boolean(skipGroup) && (elsewhere ? group(SAME_LINES[id] || id) === skipGroup : (SAME_LINES[id] || id) === (SAME_LINES[skipKey] || skipKey));
    const takes = Math.min(spec.take || 1, pool.length);
    let taken = 0;
    for (let step = 0; step < pool.length && taken < takes && said.length < max; step += 1) {
      const id = pool[(start + step) % pool.length];
      if (position === 0 && spec.any && pool.length > 1 && repeats(id)) continue;
      if (!free(id)) continue;
      const turn = spec.any ? Math.floor(Math.abs(tick) / pool.length) + position : Math.abs(tick) + position;
      if (add(id, turn)) taken += 1;
    }
  });

  if (!said.length) add(side === "leading" ? "l.nice.plain" : "f.nice.plain", tick);
  const cap = plan.cap || ASK_CAP;
  let parts = said;
  while (parts.length > 1 && parts.join(" ").length > cap) parts = parts.slice(0, -1);
  let text = calm(parts.join(" "));
  if (plan.greet) {
    const table = GREETINGS[voice] || GREETINGS.lumen;
    const pool = table[facts.part || "any"] || table.any;
    const hello = fill(pool[Math.abs(tick) % pool.length], words);
    if (hello && `${hello} ${text}`.length <= cap + 20) text = calm(`${hello} ${text}`);
  }
  return { text, key: used[0] || "", keys: used.slice(0, parts.length) };
}

/** Sentences are written one at a time; put together, the loud ones would shout. Two exclamations a reply is plenty. */
function calm(text) {
  let seen = 0;
  return text.replace(/!/g, () => {
    seen += 1;
    return seen <= 2 ? "!" : ".";
  });
}

function voiceOf(voice) {
  return VOICES.includes(voice) ? voice : "lumen";
}

/**
 * One reply. `topic` is a question from GUIDE_TOPICS, or home, nudge, done.
 * The same facts, voice, topic and tick always give the same words; pass the
 * text (and key) of what was said last and it will not be said again right away.
 */
export function guideSay(facts, voice, topic, opts = {}) {
  const speaker = voiceOf(voice);
  const tick = Number.isFinite(Number(opts.tick)) ? Math.abs(Math.trunc(Number(opts.tick))) : 0;
  const avoid = new Set(list(opts.avoid).concat(opts.last ? [opts.last] : []).filter(Boolean));
  let reply = compose(facts, speaker, topic, tick, opts.lastKey);
  for (let step = 1; step <= 8 && avoid.has(reply.text); step += 1) {
    reply = compose(facts, speaker, topic, tick + step, opts.lastKey);
  }
  return { topic, text: reply.text, key: reply.key, keys: reply.keys };
}

/** The line that goes with a celebration: `task`, `streak`, `level`, `reward` or `pair` for your own, `praise` or `reward` from your partner. */
export function guideMoment(facts, voice, kind, opts = {}) {
  const speaker = voiceOf(voice);
  const tick = Number.isFinite(Number(opts.tick)) ? Math.abs(Math.trunc(Number(opts.tick))) : 0;
  const words = wordsFor(facts, tick);
  const say = (ids) => {
    const parts = [];
    ids.forEach((choices, position) => {
      // With nothing to open on, the follow-up would be about nothing.
      if (position > 0 && !parts.length) return;
      const id = list(choices).find((choice) => WHEN[choice]?.(facts, []));
      const text = id ? sayBeat(id, speaker, words, tick + position) : null;
      if (text) parts.push(text);
    });
    return calm(parts.join(" "));
  };
  const tails = ["m.tail.first", "m.tail.streak", "m.tail.left", "m.tail.cleared", "m.tail.partner"];
  let text = "";
  if (opts.from === "partner") {
    if (kind === "praise") text = say([["m.praise"]]);
    else if (kind === "reward") text = say([["m.reward"]]);
  } else if (kind === "pair") text = say([["m.pair"]]);
  else if (kind === "reward") text = facts.side === "leading" ? say([["m.granted"]]) : "";
  else if (facts.side !== "leading" && ["task", "streak", "level", "step", "trophy"].includes(kind)) {
    if (facts.done.latest?.templateId === "daily-adventure") text = say([["m.locked"]]);
    else if (kind === "level" || kind === "step") text = say([["m.level", "m.done"], ["m.tail.level", ...tails]]);
    else if (kind === "streak") text = say([["m.streak", "m.done"], ["m.tail.left", "m.tail.partner"]]);
    else text = say([["m.done"], tails]);
  }
  return text ? { kind, text } : null;
}

/* ---------- the hooks the engine calls ---------- */

const sources = [];

/**
 * Lets another feature teach the stuffie something without touching this file.
 * `source(db, viewer, facts)` returns an object merged into `facts.extras`:
 * plain facts, `words` (extra {placeholders}), and `beats` (extra lines, see
 * extraBeatsFor). Returns a function that removes the source again.
 */
export function addGuideSource(source) {
  if (typeof source !== "function") return () => undefined;
  sources.push(source);
  return () => {
    const index = sources.indexOf(source);
    if (index >= 0) sources.splice(index, 1);
  };
}

function factsWithSources(db, viewer, opts) {
  const facts = guideFacts(db, viewer, opts);
  for (const source of sources) {
    try {
      const more = source(db, viewer, facts);
      if (!more || typeof more !== "object") continue;
      const beats = [...list(facts.extras.beats), ...list(more.beats)];
      const words = { ...facts.extras.words, ...more.words };
      facts.extras = { ...facts.extras, ...more, beats, words };
    } catch {
      /* A feature that cannot add its facts must not silence the stuffie. */
    }
  }
  return facts;
}

function fallback(user, event) {
  const who = stuffieOf(user);
  const line = guideSpeech(who.voice, event, {
    name: firstName(user) || "you",
    partner: "your partner",
    side: user?.slashSide,
    streak: 0,
    tick: 0,
  });
  return { ...line, guideId: who.voice };
}

function joined(detail, say) {
  const before = String(detail || "").trim();
  if (!before) return say;
  return `${before}${/[.!?…]$/.test(before) ? "" : "."} ${say}`;
}

/**
 * The stuffie's part of what the app receives: the Home greeting, and its own
 * sentence added to a celebration. When a well done or a granted reward from the
 * partner is waiting to be shown, the greeting is about that instead.
 */
export function guideBundle(db, user, extra = {}, opts = {}) {
  const who = stuffieOf(user);
  const meta = { guideId: who.voice, name: who.name, species: who.species, tz: clockOf(user?.guideClock) };
  try {
    const waiting = list(user?.cheers);
    const kind = waiting[0]?.kind;
    const cheer = kind === "praise" || kind === "reward"
      ? { kind, what: waiting.filter((entry) => entry.kind === kind).map((entry) => String(entry.what || "")).filter(Boolean) }
      : null;
    const facts = factsWithSources(db, user, { ...opts, extras: { ...opts.extras, cheer } });
    const seed = hash([facts.day, facts.part, facts.done.today.length, facts.praise.waiting.length, facts.praise.said, facts.open.count, facts.notes.count].join("|"));
    const fromPartner = cheer ? guideMoment(facts, who.voice, cheer.kind, { tick: seed, from: "partner" }) : null;
    const greeting = fromPartner ? null : guideSay(facts, who.voice, "home", { tick: seed });
    const home = fromPartner
      ? { event: fromPartner.kind, text: fromPartner.text, key: `m.${fromPartner.kind}` }
      : { event: "home", text: greeting.text, key: greeting.key };
    const out = { guide: { ...meta, ...home } };
    const party = extra?.celebration;
    if (party && typeof party === "object" && typeof party.kind === "string") {
      const moment = guideMoment(facts, who.voice, party.kind, { tick: seed + facts.done.total });
      if (moment) out.celebration = { ...party, detail: joined(party.detail, moment.text) };
    }
    return out;
  } catch {
    return { guide: { ...meta, ...fallback(user, "home") } };
  }
}

/**
 * Answers a tap. `body.topic` is one of GUIDE_TOPICS (or home, nudge, done);
 * older callers send `body.event` instead. `body.tick` picks the phrasing,
 * `body.last` / `body.lastKey` are what was said just before, and `body.tz` is
 * the phone's `getTimezoneOffset()`, returned as `clock` for the engine to keep.
 */
export function guideAnswer(db, user, body = {}, opts = {}) {
  const who = stuffieOf(user);
  const asked = typeof body?.topic === "string" ? body.topic : OLD_EVENTS[body?.event] || "nudge";
  const side = user?.slashSide === "leading" ? "leading" : "following";
  const topic = PLANS[side][asked] ? asked : "nudge";
  const event = typeof body?.event === "string" && OLD_EVENTS[body.event] ? body.event : topic;
  const clock = clockOf(body?.tz);
  try {
    const facts = factsWithSources(db, user, { ...opts, tz: clock ?? undefined });
    const sent = body?.tick == null || body.tick === "" ? NaN : Number(body.tick);
    const tick = Number.isFinite(sent) ? sent : Math.floor(facts.now / 1000);
    const reply = guideSay(facts, who.voice, topic, { tick, last: typeof body?.last === "string" ? body.last : "", lastKey: typeof body?.lastKey === "string" ? body.lastKey : "" });
    return { line: { guideId: who.voice, name: who.name, event, topic, text: reply.text, key: reply.key }, clock };
  } catch {
    return { line: { ...fallback(user, OLD_EVENTS[event] || "nudge"), name: who.name, event, topic, key: "" }, clock };
  }
}
