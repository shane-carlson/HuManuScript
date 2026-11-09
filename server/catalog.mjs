/** Task types, guides, and progression for SlashConnect. Adult roles only. */

export const PRONOUN_PRESETS = [
  { label: "she/her", subject: "she", object: "her", possessive: "her", reflexive: "herself" },
  { label: "he/him", subject: "he", object: "him", possessive: "his", reflexive: "himself" },
  { label: "they/them", subject: "they", object: "them", possessive: "their", reflexive: "themself" },
  { label: "ze/hir", subject: "ze", object: "hir", possessive: "hir", reflexive: "hirself" },
];

export const ROLE_SUGGESTIONS = {
  leading: ["Top", "Dom", "Domme", "Daddy", "Mommy", "Caretaker"],
  following: ["Bottom", "Submissive", "Little", "Middle", "Babygirl", "Babyboy"],
};

export const GOAL_OPTIONS = [
  { key: "connection", title: "Deeper connection", detail: "Share something real across the distance.", target: 8 },
  { key: "structure", title: "Structure", detail: "A rhythm you can both see.", target: 10 },
  { key: "accountability", title: "Accountability", detail: "Promises kept, where you can both find them.", target: 10 },
  { key: "self-care", title: "Self-care", detail: "Care you can do with what you already have.", target: 6 },
  { key: "play", title: "Play", detail: "Fun that still counts as a promise.", target: 6 },
  { key: "ritual", title: "Ritual", detail: "Small repeats that make the week feel held.", target: 6 },
  { key: "communication", title: "Communication", detail: "The words you meant to send.", target: 6 },
  { key: "celebration", title: "Celebration", detail: "Notice what went well.", target: 4 },
];

export const GUIDES = [
  {
    id: "lumen",
    name: "Lumen",
    species: "fox",
    blurb: "Steady and specific. Lumen notices when you follow through.",
    hue: 12,
  },
  {
    id: "pip",
    name: "Pip",
    species: "finch",
    blurb: "Bright and playful. Pip cheers the small wins.",
    hue: 42,
  },
  {
    id: "moss",
    name: "Moss",
    species: "moth",
    blurb: "Quiet company. Moss is good at pauses and grounding.",
    hue: 168,
  },
  {
    id: "sol",
    name: "Sol",
    species: "sun",
    blurb: "Warm and celebratory. Sol likes streaks and showing up.",
    hue: 330,
  },
];

export const LEVELS = [
  { id: "spark", name: "Spark", min: 0 },
  { id: "glow", name: "Glow", min: 40 },
  { id: "kindle", name: "Kindle", min: 90 },
  { id: "hearth", name: "Hearth", min: 160 },
  { id: "beacon", name: "Beacon", min: 250 },
  { id: "constellation", name: "Constellation", min: 400 },
];

export const JOURNAL_PROMPTS = [
  "What felt close between you this week?",
  "Name a small thing you want more of.",
  "What are you proud of today, even if it is ordinary?",
  "Something that felt hard, and one kind thing you did anyway.",
  "A ritual you want the two of you to keep.",
  "What does feeling safe in your body mean today?",
  "A message you wish your partner could hear.",
  "Where did you keep a promise to yourself this week?",
  "What do you want your partner to notice?",
  "Describe a moment of care you still remember.",
];

const ANAL_NOTES = {
  new: [
    "Talk about what you want before anything happens.",
    "Use plenty of lubricant made for this, and stop the moment you want to.",
    "Start smaller and slower than your imagination.",
    "Keep a check-in word you both already know.",
    "After: water, comfort, and a few honest words.",
  ],
  some: [
    "Decide the pace together before you begin.",
    "Warm up slowly and add time only if it still feels good.",
    "Keep lubricant within reach.",
    "Tell your partner one thing that felt right afterward.",
  ],
  experienced: [
    "Name the focus: comfort, duration, or a toy you already enjoy.",
    "Check in halfway, even when things are going well.",
    "Leave your partner one note when you are done.",
  ],
};

export function levelFor(points) {
  const score = Math.max(0, Number(points) || 0);
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (score >= level.min) current = level;
  }
  const index = LEVELS.findIndex((level) => level.id === current.id);
  const next = LEVELS[index + 1] || null;
  const span = next ? next.min - current.min : 1;
  const progress = next ? Math.min(1, (score - current.min) / span) : 1;
  return {
    name: current.name,
    id: current.id,
    min: current.min,
    next: next ? next.name : null,
    nextMin: next ? next.min : null,
    progress,
  };
}

export function coachingFor(templateId, experienceLevel) {
  if (templateId !== "anal-training") return [];
  return ANAL_NOTES[experienceLevel] || ANAL_NOTES.new;
}

export function fillLine(template, ctx) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (ctx[key] == null ? "" : String(ctx[key])));
}

const GUIDE_LINES = {
  lumen: {
    home: [
      "{name}, the day can hold one clear promise.",
      "Specific is kinder than a pile of tasks.",
      "{partner} does not need a perfect day. One kept promise is enough.",
    ],
    done: [
      "Kept. That is the whole assignment.",
      "I saw that, {name}. It counts.",
      "Follow-through looks good on you.",
    ],
    streak: ["{streak} days in a row. The rhythm is real.", "You came back. That is the streak."],
    ground: ["Pause first. The task can wait.", "Breathe with the circle. Nothing else is due for a minute."],
    nudge: ["Pick the smallest open promise and finish that one.", "A short note to {partner} still counts as care."],
    assign: ["One clear ask lands better than five vague ones.", "Tell {partner} why this one matters."],
  },
  pip: {
    home: [
      "Hi {name}. I saved you a bright spot.",
      "Small and done beats grand and waiting.",
      "{partner} likes seeing you show up. So do I.",
    ],
    done: ["Yes! Put that on the board.", "You did it. I am doing a tiny lap.", "Points are just confetti for a real action."],
    streak: ["{streak} days! I brought invisible streamers.", "The streak is waving at you."],
    ground: ["We can be silly after we land. Breath first.", "Five things you can see. I will wait."],
    nudge: ["A snack and a song is a complete quest.", "Open the fun list if the serious one feels heavy."],
    assign: ["Make it doable today, then add a bonus for flair.", "Playful still needs a finish line."],
  },
  moss: {
    home: [
      "Hello {name}. Soft light is enough.",
      "You can move slowly and still keep the promise.",
      "If {partner} is busy, the grounding room is here.",
    ],
    done: ["Quiet credit. You finished.", "That was care, even if nobody clapped.", "Rest is allowed after a kept promise."],
    streak: ["{streak} gentle days. No need to rush the next one.", "Coming back is the practice."],
    ground: ["In for four. Hold. Out. Hold. I am here.", "Name what you can feel. Leave the rest."],
    nudge: ["Choose the task that asks the least of you.", "A mirror minute is enough for a hard day."],
    assign: ["Leave room in the ask. Pressure is not structure.", "A due date is a kindness only if it is real."],
  },
  sol: {
    home: [
      "{name}, the hearth is lit.",
      "Show up, then let yourself be proud.",
      "{streak} on the streak, {points} points warm.",
    ],
    done: ["That glow is yours.", "I am celebrating with you.", "Tell {partner}. They should get to see this."],
    streak: ["{streak} days of coming back. That is devotion.", "The streak is a light you both can see."],
    ground: ["Even a bright day needs a pause.", "Set the shine down. Breathe."],
    nudge: ["Finish one thing and let it be plenty.", "Your points can become a reward you both wanted."],
    assign: ["Assign the thing that would make {partner} feel chosen.", "Care points come from noticing, not from piling on."],
  },
};

export function guideSpeech(guideId, event, ctx) {
  const pack = GUIDE_LINES[guideId] || GUIDE_LINES.lumen;
  const pool = pack[event] || pack.home;
  const index = Math.abs(Number(ctx.tick) || 0) % pool.length;
  return {
    guideId: pack === GUIDE_LINES[guideId] ? guideId : "lumen",
    event,
    text: fillLine(pool[index], ctx),
  };
}

function task(partial) {
  return {
    bonuses: [],
    supplyHints: [],
    goalKeys: [],
    completion: "note",
    timerSeconds: 0,
    photoMin: 0,
    photoMax: 0,
    photoLabel: "",
    checklistCount: 0,
    checklistIdeas: [],
    choices: [],
    consent: false,
    promptPool: null,
    ...partial,
  };
}

export const TEMPLATES = [
  task({
    id: "shower-bath",
    category: "self-care",
    title: "Hot shower or bath",
    summary: "Take a warm shower or bath. There is a bonus if you use a bubble bath or a shower steamer you already own.",
    points: 15,
    bonuses: [{ id: "bubbles", label: "Used a bubble bath or shower steamer", points: 8 }],
    supplyHints: ["bubble", "bath", "steamer", "shower"],
    goalKeys: ["self-care", "ritual"],
    completion: "note",
  }),
  task({
    id: "self-care-trio",
    category: "self-care",
    title: "Self-care trio",
    summary: "Mix and match three kinds of care you can do with what you have. A long shower, a face mask, and a home manicure is one trio.",
    points: 25,
    supplyHints: ["mask", "nail", "lotion", "bath", "oil"],
    goalKeys: ["self-care", "ritual"],
    completion: "checklist",
    checklistCount: 3,
    checklistIdeas: [
      "Long shower",
      "Face mask",
      "Home manicure",
      "Lotion or body oil",
      "Stretch on the floor",
      "Tea and a quiet seat",
      "Clean sheets",
      "Hair care you already own",
    ],
  }),
  task({
    id: "selfie",
    category: "self-care",
    title: "A small photoshoot",
    summary: "Take a few photos you like and share them with your partner. Cute, dressed up, or just good light. A tiny shoot counts.",
    points: 18,
    goalKeys: ["connection", "celebration"],
    completion: "photos",
    photoMin: 1,
    photoMax: 3,
    photoLabel: "Share up to three photos with your partner",
  }),
  task({
    id: "journal",
    category: "self-care",
    title: "Journal",
    summary: "Write to the prompt, then share what you want your partner to read.",
    points: 15,
    goalKeys: ["connection", "communication", "ritual"],
    completion: "note",
    promptPool: "journal",
  }),
  task({
    id: "mirror",
    category: "self-care",
    title: "One mirror minute",
    summary: "Look at yourself for one minute. Write what you liked or felt neutral about. No insults in the note.",
    points: 12,
    goalKeys: ["self-care", "ritual"],
    completion: "timer",
    timerSeconds: 60,
  }),
  task({
    id: "walk",
    category: "self-care",
    title: "Go for a walk",
    summary: "Walk outside, at a gym, or on a treadmill at home.",
    points: 15,
    goalKeys: ["self-care", "structure"],
    completion: "choices",
    choices: ["Outside", "Gym", "Treadmill at home"],
  }),
  task({
    id: "feel-good-song",
    category: "fun",
    title: "A song that feels good",
    summary: "Play a song that lifts you. Bonus if you sing or dance.",
    points: 12,
    bonuses: [{ id: "move", label: "Sang or danced", points: 6 }],
    goalKeys: ["play", "celebration"],
    completion: "note",
  }),
  task({
    id: "phone-free-air",
    category: "self-care",
    title: "Step outside without your phone",
    summary: "Leave the phone inside. Look around, take a breath, and notice what you can actually sense.",
    points: 12,
    goalKeys: ["self-care", "ritual"],
    completion: "note",
  }),
  task({
    id: "hobby-hour",
    category: "fun",
    title: "An hour with your hobby",
    summary: "Spend an hour on a hobby you already love. Name it in the note.",
    points: 20,
    goalKeys: ["play", "structure"],
    completion: "note",
  }),
  task({
    id: "snack-cartoon",
    category: "fun",
    title: "Snack and a cartoon",
    summary: "Make a snack and watch a favorite cartoon or animated show.",
    points: 12,
    goalKeys: ["play"],
    completion: "note",
  }),
  task({
    id: "try-a-table",
    category: "fun",
    title: "Somewhere you meant to try",
    summary: "Go to a restaurant, cafe, or bar you have been meaning to try, and order something.",
    points: 22,
    goalKeys: ["play", "celebration"],
    completion: "note",
  }),
  task({
    id: "plush-adventure",
    category: "fun",
    title: "Comfort plush on an adventure",
    summary: "Take a comfort plush, or another small companion, out with you. A hike with a photo or a seat at the movies both count.",
    points: 18,
    goalKeys: ["play", "connection"],
    completion: "photos",
    photoMin: 0,
    photoMax: 3,
    photoLabel: "Optional photos from the outing",
  }),
  task({
    id: "library",
    category: "fun",
    title: "Library checkout",
    summary: "Visit a library and check out a book or movie. Sign up for a card if you need one.",
    points: 18,
    goalKeys: ["play", "structure"],
    completion: "note",
  }),
  task({
    id: "new-kit",
    category: "fun",
    title: "Pick a new kit",
    summary: "Choose a kit to try: embroidery, knitting, cross stitch, mosaic, jewelry, or a science kit.",
    points: 18,
    goalKeys: ["play"],
    completion: "note",
  }),
  task({
    id: "solo-movie",
    category: "fun",
    title: "Take yourself to a movie",
    summary: "See a movie on your own. Bonus if you get a snack and a drink.",
    points: 20,
    bonuses: [{ id: "snacks", label: "Got a snack and a drink", points: 6 }],
    goalKeys: ["play", "celebration"],
    completion: "note",
  }),
  task({
    id: "catch-up",
    category: "fun",
    title: "Catch up with someone",
    summary: "Reach out to someone you have not spoken with in a while, and actually catch up.",
    points: 15,
    goalKeys: ["communication", "connection"],
    completion: "note",
  }),
  task({
    id: "grounding-pause",
    category: "grounding",
    title: "Grounding pause",
    summary: "Use box breathing or a counting round. Useful when your partner is busy and you need to settle.",
    points: 10,
    goalKeys: ["self-care", "ritual"],
    completion: "breath",
  }),
  task({
    id: "anal-training",
    category: "spicy",
    title: "Anal training",
    summary: "A practice session at your pace. Your experience level changes the notes. Stop whenever you want, and skip this if you do not want it.",
    points: 20,
    goalKeys: ["connection"],
    completion: "note",
    consent: true,
  }),
  task({
    id: "scene-plan",
    category: "spicy",
    title: "Plan a scene you want",
    summary: "Write a scene you want with your partner: what you need, what you want to happen, and what aftercare looks like. Sharing the note is the task.",
    points: 20,
    goalKeys: ["connection", "communication"],
    completion: "note",
    consent: true,
  }),
  task({
    id: "three-nudes",
    category: "spicy",
    title: "Three private photos",
    summary: "Take three intimate photos for your partner, without overthinking them. They stay in this household. Send them only if you want to.",
    points: 22,
    goalKeys: ["connection"],
    completion: "photos",
    photoMin: 3,
    photoMax: 3,
    photoLabel: "Three private photos for your partner",
    consent: true,
  }),
  task({
    id: "sexy-story",
    category: "spicy",
    title: "A story about the two of you",
    summary: "Write a sexy story about you and your partner, then send it to them here.",
    points: 22,
    goalKeys: ["connection", "communication"],
    completion: "note",
    consent: true,
  }),
];

export function templateById(id) {
  return TEMPLATES.find((item) => item.id === id) || null;
}

export const CATEGORIES = [
  { id: "self-care", label: "Self-care", tint: "coral" },
  { id: "fun", label: "Fun", tint: "gold" },
  { id: "spicy", label: "Spicy", tint: "lilac" },
  { id: "grounding", label: "Grounding", tint: "teal" },
];
