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
};

export type Bundle = {
  token?: string;
  me: Person;
  partner: Person | null;
  pair: { id: string; members: string[] } | null;
  demo: boolean;
  tasks: Task[];
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
    templates: Template[];
    journalPrompts: string[];
    levelLadder: string[];
  };
  celebration?: { kind: string; title: string; detail: string; points?: number } | null;
  invite?: { code: string };
};
