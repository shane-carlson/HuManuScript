import type { AvatarData } from "./avatar/looks.ts";
import type { Stuffie } from "./stuffie/roll.ts";

export type Pronouns = {
  label: string;
  subject: string;
  object: string;
  possessive: string;
  reflexive: string;
};

export type Person = {
  id: string;
  email: string;
  displayName: string;
  adultConfirmed: boolean;
  demo?: boolean;
  pronouns: Pronouns | null;
  gender: string;
  slashSide: "" | "leading" | "following";
  roleTitle: string;
  goals: string[];
  supplies: string[];
  guideId: string;
  /** `look` is the character face. Avatars saved before there were faces have only the colour and mark. */
  avatar: AvatarData;
  /** The stuffie this person made, if they have made one. It is the one in use when `guideId` is "custom". */
  stuffie?: Stuffie | null;
  experienceLevel: "" | "new" | "some" | "experienced";
  onboardingComplete: boolean;
  points: number;
  carePoints: number;
  streak: number;
  lastActiveDate: string;
};

export type Task = {
  id: string;
  templateId: string;
  category: string;
  title: string;
  summary: string;
  note: string;
  prompt: string;
  points: number;
  bonuses: { id: string; label: string; points: number }[];
  assignedBy: string;
  assignedTo: string;
  status: "open" | "done" | "skipped";
  dueDate: string;
  completedAt: string | null;
  acknowledgedAt: string | null;
  completion: null | {
    note: string;
    bonuses: string[];
    photos: string[];
    checklist: string[];
    choice: string;
    /** Photos that are kept but not shown on the Free plan, because the task was finished a while back. */
    photosKept?: number;
  };
  supplyNote: string;
  coaching: string[];
  checklistIdeas: string[];
  checklistCount: number;
  completionKind: string;
  timerSeconds: number;
  photoMin: number;
  photoMax: number;
  photoLabel: string;
  choices: string[];
  consent: boolean;
  repeat: "once" | "daily";
  routineActive: boolean;
  day?: string;
  /** For a task with a running count, like ounces of water. `target` is 0 for every other task. */
  target: number;
  unit: string;
  amountSteps: number[];
  progress: null | { amount: number; entries: { id: string; amount: number; at: string }[] };
  adventure: null | {
    stage: "sealed" | "locked";
    day: string;
    categories: string[];
    locked: { taskId: string; templateId: string; title: string; category: string }[];
  };
};

export type Goal = {
  id: string;
  goalKey: string;
  title: string;
  detail: string;
  target: number;
  progress: number;
};

export type Reward = {
  id: string;
  title: string;
  detail: string;
  cost: number;
  proposedBy: string;
  status: "proposed" | "agreed" | "requested" | "granted";
  agreedBy: string[];
};

export type Checkin = {
  id: string;
  fromUserId: string;
  kind: string;
  note: string;
  createdAt: string;
  seenBy: string[];
};

export type Template = {
  id: string;
  category: string;
  title: string;
  summary: string;
  points: number;
  bonuses: { id: string; label: string; points: number }[];
  supplyHints: string[];
  completion: string;
  promptPool: string | null;
  consent: boolean;
  habit: boolean;
  custom: boolean;
  noteLabel: string;
  notePlaceholder: string;
  unit: string;
  amountDefault: number;
  amountSteps: number[];
};

export type Routine = {
  id: string;
  taskId: string;
  title: string;
  category: string;
  points: number;
  status: "open" | "done" | "skipped";
  day: string;
  target: number;
  amount: number;
  unit: string;
  daysDone: number;
};

/** One person's weekly check-in. A rating of 0 means they left the scale alone. */
export type WeeklyEntry = {
  week: string;
  userId: string;
  self: string;
  selfRating: number;
  dynamic: string;
  dynamicRating: number;
  needs: string;
  requests: string[];
  requestNote: string;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
};

/** Both check-ins for one week. `partner` stays null while it is sealed, even if `partnerSent` is true. */
export type WeeklyWeek = {
  week: string;
  weekEnd: string;
  past: boolean;
  mine: WeeklyEntry | null;
  partner: WeeklyEntry | null;
  partnerSent: boolean;
};

export type WeeklyRatings = { selfRating: number; dynamicRating: number };

export type Weekly = {
  available: boolean;
  today: string;
  /** The Monday this week started on, by this person's own calendar. */
  week: string;
  weekEnd: string;
  state: "unpaired" | "open" | "partner-waiting" | "mine-in" | "both";
  mine: WeeklyEntry | null;
  partner: WeeklyEntry | null;
  partnerSent: boolean;
  /** Whether the partner's check-in for this week is new to this person, or changed since they read it. */
  unread: "" | "new" | "changed";
  /** What the partner most recently asked for, from this week or last. */
  asks: { week: string; thisWeek: boolean; requests: string[]; note: string } | null;
  earns: number;
  limits: { text: number; note: number };
  choices: { id: string; label: string; ask: string; side: "" | "leading" | "following" }[];
  history: { week: string; weekEnd: string; mine: WeeklyRatings | null; partner: WeeklyRatings | null }[];
  /** Earlier weeks that are kept but not shown on the Free plan. */
  olderWeeks?: number;
  /** One week in full, when it was asked for. */
  opened?: WeeklyWeek | null;
};

/** A level and the step inside it. The step fields are missing when the server is older than this app. */
export type Level = {
  name: string;
  id: string;
  progress: number;
  next: string | null;
  nextMin: number | null;
  min: number;
  index?: number;
  /** The level with its step, as in "Glow IV". */
  title?: string;
  step?: {
    index: number;
    of: number;
    numeral: string;
    name: string;
    min: number;
    nextMin: number | null;
    nextTitle: string | null;
    toNext: number;
    progress: number;
  };
};

export type ProgressDay = { date: string; state: "none" | "active" | "full" | "rest" | "ahead"; tasks: number; points: number };

export type Progress = {
  /** The following partner's calendar day, which is the day all of this is counted by. */
  day: string;
  embers: number;
  level: Level;
  ladder: { id: string; name: string; min: number; state: "done" | "here" | "ahead" }[];
  today: {
    goal: "dailies" | "points";
    dailyDone: number;
    dailyTotal: number;
    points: number;
    pointsGoal: number;
    tasks: number;
    progress: number;
    full: boolean;
    bonus: number;
  };
  streak: {
    days: number;
    best: number;
    doneToday: boolean;
    /** Where the weekly rest day stands: free to use, used (until `restReadyOn`), or covering yesterday right now. */
    rest: "none" | "ready" | "used" | "resting";
    restReadyOn: string;
    next: { days: number; embers: number } | null;
  };
  week: { start: string; days: number; need: number; kept: boolean; daysLeft: number; streak: number; best: number; bonus: number };
  /** Twelve weeks, Monday first, ending with this week. The Free plan shows the last four. */
  calendar: ProgressDay[];
  /** Weeks of the calendar that are kept but not shown on the Free plan. */
  olderWeeks?: number;
  care: {
    points: number;
    level: { id: string; name: string; min: number; index: number; next: string | null; nextMin: number | null; progress: number };
    given: number;
    waiting: number;
    streak: number;
    best: number;
    finished7: number;
    answered7: number;
  };
  rules: {
    dayPoints: number;
    fullDay: number;
    weekDays: number;
    weekEmbers: number;
    restEvery: number;
    streak: { days: number; embers: number }[];
  };
};

export type TrophyTint = "coral" | "gold" | "teal" | "lilac" | "plum";

/** What it takes to draw a trophy. `art` names the picture, as in "level:glow" or "flame:7". */
export type TrophyBadge = { id: string; title: string; art: string; tint: TrophyTint };

export type Trophy =
  | (TrophyBadge & {
      group: string;
      earned: true;
      line: string;
      at: string;
      day: string;
      /** A person's id, or "both". */
      by: string;
      /** Earned before there was a shelf, so it arrived without a fuss. */
      early: boolean;
    })
  | { id: string; group: string; earned: false; hint: string; tint: TrophyTint; have?: number; need?: number };

/** What progress adds to a celebration. All of it is optional. */
export type CelebrationNews = {
  eyebrow?: string;
  also?: string[];
  embers?: number;
  trophies?: TrophyBadge[];
  level?: { id: string; name: string; title: string; step: number; major: boolean };
};

/** One line of the Free and Plus table, with where this household stands on it. */
export type PlanFeature = {
  id: string;
  title: string;
  line: string;
  /** The same on both plans. */
  always: boolean;
  /** What each plan gets, in words. Empty when `always`. */
  free: string;
  plus: string;
  /** The Free limit and how much of it is used, for the lines that are counted. */
  limit: number | null;
  used: number | null;
  usage: string;
  /** What a Free household is told at this line's limit. */
  nudge: string;
  /** The Plus side of this line is theirs right now, or, for a counted line, there is room to add one. */
  open: boolean;
};

/** The household's plan. One plan covers both partners. */
export type Plan = {
  tier: "free" | "plus";
  /** Everything is open because the app is in testing. */
  earlyAccess: boolean;
  /** What the limits go by right now. */
  effective: "free" | "plus";
  /** Set while a plan is being tried out on a build that is not hosted. */
  preview: "" | "free" | "plus";
  canSwitch: boolean;
  names: { free: string; plus: string };
  note: string;
  historyWeeks: number;
  /** The stuffie questions that are on the Plus side. `side` keeps one to that side of the slash. */
  deepTopics: { topic: string; side?: string }[];
  features: PlanFeature[];
};

export type Bundle = {
  token?: string;
  me: Person;
  partner: Person | null;
  pair: { id: string; members: string[] } | null;
  demo: boolean;
  hosted: boolean;
  tasks: Task[];
  routines: Routine[];
  goals: Goal[];
  rewards: Reward[];
  checkins: Checkin[];
  /** Missing when the server is older than this app. */
  weekly?: Weekly;
  invites: { code: string; channel: string; contact: string }[];
  stats: {
    points: number;
    carePoints: number;
    streak: number;
    openCount: number;
    doneCount: number;
    level: Level;
    /** What the level is counted in. Points are spent; embers never go down. */
    embers?: number;
  };
  /** Free or Plus, and the table both are drawn from. Missing when the server is older than this app. */
  plan?: Plan;
  /** The couple's progress, the same for both. Missing when the server is older than this app. */
  progress?: Progress;
  /** Every trophy there is, earned or not, in shelf order. */
  shelf?: Trophy[];
  /**
   * What the stuffie says on Home. `event` is "home", or "praise" / "reward" when it is
   * about something the partner just did. `key` names the subject, so a tap can move on from it.
   */
  guide: { guideId: string; text: string; event?: string; name?: string; species?: string; key?: string; tz?: number | null };
  meta: {
    guides: { id: string; name: string; species: string; blurb: string; hue: number }[];
    goals: { key: string; title: string; detail: string; target: number }[];
    pronouns: Pronouns[];
    roles: { leading: string[]; following: string[] };
    categories: { id: string; label: string }[];
    seals: { id: string; label: string; headspace: string; tease: string }[];
    templates: Template[];
    journalPrompts: string[];
    levelLadder: string[];
  };
  celebration?: ({ kind: string; title: string; detail: string; points?: number } & CelebrationNews) | null;
  /** A celebration the partner set off. It waits here until this person has seen it. */
  cheer?: ({ ids: string[]; kind: string; from: string; title: string; detail: string } & CelebrationNews) | null;
  invite?: { code: string };
};
