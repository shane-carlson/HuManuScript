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
  avatar: { hue: number; mark: string };
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

export type Bundle = {
  token?: string;
  me: Person;
  partner: Person | null;
  pair: { id: string; members: string[] } | null;
  demo: boolean;
  tasks: Task[];
  routines: Routine[];
  goals: Goal[];
  rewards: Reward[];
  checkins: Checkin[];
  invites: { code: string; channel: string; contact: string }[];
  stats: {
    points: number;
    carePoints: number;
    streak: number;
    openCount: number;
    doneCount: number;
    level: { name: string; id: string; progress: number; next: string | null; nextMin: number | null; min: number };
  };
  guide: { guideId: string; text: string; event?: string };
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
  celebration?: { kind: string; title: string; detail: string; points?: number } | null;
  /** A celebration the partner set off. It waits here until this person has seen it. */
  cheer?: { ids: string[]; kind: string; from: string; title: string; detail: string } | null;
  invite?: { code: string };
};
