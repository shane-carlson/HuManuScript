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
  { key: "connection", title: "Deeper connection", detail: "Feeling close, even with the miles.", target: 8 },
  { key: "structure", title: "Structure", detail: "A routine you both know by heart.", target: 10 },
  { key: "accountability", title: "Accountability", detail: "Saying you’ll do it, then showing you did.", target: 10 },
  { key: "self-care", title: "Self-care", detail: "Looking after yourself with what’s already in the house.", target: 6 },
  { key: "play", title: "Play", detail: "Being silly together on purpose.", target: 6 },
  { key: "ritual", title: "Ritual", detail: "The little things you do every time, like good morning texts.", target: 6 },
  { key: "communication", title: "Communication", detail: "Saying the thing instead of sitting on it.", target: 6 },
  { key: "celebration", title: "Celebration", detail: "Making a fuss when something goes well.", target: 4 },
];

export const GUIDES = [
  {
    id: "lumen",
    name: "Lumen",
    species: "kitsune",
    blurb: "Three tails and a smug little face. Lumen keeps count of every task you finish.",
    hue: 12,
  },
  {
    id: "pip",
    name: "Pip",
    species: "baby phoenix",
    blurb: "Loud about small wins and bad at sitting still. Pip does a lap every time you finish something.",
    hue: 42,
  },
  {
    id: "moss",
    name: "Moss",
    species: "sleepy dragon",
    blurb: "Soft, slow, and half asleep. Moss is good company when you need quiet.",
    hue: 168,
  },
  {
    id: "sol",
    name: "Sol",
    species: "unicorn",
    blurb: "Already proud of you. Sol wants a streak to brag about.",
    hue: 330,
  },
];

export const LEVELS = [
  { id: "spark", name: "Spark", min: 0 },
  { id: "glow", name: "Glow", min: 40 },
  { id: "flame", name: "Flame", min: 90 },
  { id: "hearth", name: "Hearth", min: 160 },
  { id: "beacon", name: "Beacon", min: 250 },
  { id: "constellation", name: "Constellation", min: 400 },
];

export const JOURNAL_PROMPTS = [
  "What made you feel close to your partner this week?",
  "What’s one small thing you want more of?",
  "What are you proud of today? Boring answers count.",
  "What was hard today, and what did you do about it?",
  "Which of your rituals do you never want to drop?",
  "Which rule or task has helped you most lately?",
  "What do you wish you could say to your partner right now?",
  "Where did you do what you said you’d do this week?",
  "What do you want your partner to notice?",
  "Write about a time your partner took good care of you.",
];

const ANAL_NOTES = {
  new: [
    "Talk through what you want before anything happens.",
    "Use lots of lube made for this. More than you think you need.",
    "Start smaller and slower than you imagined.",
    "Agree on a check-in word you both already use.",
    "Stop the second you want to.",
    "Afterwards: water, something cozy, and a few honest words to your D‑type.",
  ],
  some: [
    "Agree on the pace with your D‑type before you start.",
    "Warm up slowly. Only add time if it still feels good.",
    "Keep the lube within reach.",
    "Afterwards, tell your D‑type one thing that felt right.",
  ],
  experienced: [
    "Pick a focus: comfort, how long, or a toy you already like.",
    "Check in with yourself halfway, even if it’s going well.",
    "Leave your D‑type a note when you’re done.",
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
      "{name}. Good, you’re here. Pick a task and I’ll watch.",
      "{partner} asked. You said yes. Off you go.",
      "One task before anything else. I’ll keep your spot warm.",
    ],
    homeLead: [
      "{name}. Go see what {partner} got done today.",
      "Give {partner} one clear task today. Five vague ones just get ignored.",
      "Did {partner} finish something? Say well done before you add more.",
    ],
    done: ["Done. That’s going in the count.", "One more, {name}. {partner} will see it.", "Good. Now go collect your well done."],
    streak: ["{streak} days running. Yes, I’ve been counting.", "{streak} in a row. Don’t make me start over at one."],
    streakLead: ["{partner} is at {streak} days running. I’d mention it if I were you.", "{streak} in a row for {partner}. That deserves a note."],
    streakStart: ["No streak yet. Finish one task today and I start counting."],
    ground: ["Sit. Breathe with the circle. The list will wait.", "Four in, hold four, four out, hold four. I’ll count."],
    nudge: ["Pick the easiest thing on your list and do that first.", "Stuck? Tell {partner} you’re stuck. Two lines is enough."],
    nudgeLead: ["It’s been quiet. Send {partner} a note or a task.", "Small and specific. Something {partner} can finish tonight."],
    assign: ["Say exactly what you want and when you want it.", "Add a line about why you picked it. {partner} will read it twice."],
  },
  pip: {
    home: [
      "{name}! You’re here! What are we doing first?",
      "I vote the fun one first. Nobody asked me.",
      "A task from {partner} is a love note with a due date.",
    ],
    homeLead: [
      "{name}! Give {partner} something fun today. I’m asking nicely.",
      "Did {partner} finish something? Go say well done! Go go go!",
      "Put extra points on something. Extra points are the best part.",
    ],
    done: ["YES! Done! I’m doing a lap around the room.", "You did the thing! {partner} is going to be so pleased.", "Points! Shiny, lovely points!"],
    streak: ["{streak} days! In a row! I set my tail on fire about it.", "{streak} days. I’d throw confetti but I don’t have thumbs."],
    streakLead: ["{partner} is on {streak} days! Go make a fuss!", "{streak} days for {partner}. I already did a lap about it."],
    streakStart: ["No streak yet! One task today and we’re off."],
    ground: ["Okay. Quiet wings. Breathe in with me.", "Five things you can see. I’ll sit very still. Mostly."],
    nudge: ["Snack first, then one task. That’s the whole plan.", "If the list looks big, do the silliest one."],
    nudgeLead: ["Send {partner} a task with extra points on it.", "A quick note to {partner} takes ten seconds. I timed it."],
    assign: ["Make it something {partner} can finish today.", "Extra points. Put some on. Go on."],
  },
  moss: {
    home: [
      "Hi {name}. No rush. I’m here.",
      "Go slow today if you need to. It still counts.",
      "If {partner}'s busy, come sit with me in grounding.",
    ],
    homeLead: [
      "Hi {name}. Maybe something gentle for {partner} today.",
      "{partner} would like to hear from you. Even a short note.",
      "Go easy on the due dates this week.",
    ],
    done: ["You did it. Good.", "That’s done. You can rest now.", "I saw. {partner} will too."],
    streak: ["{streak} days. That’s a lot of showing up.", "{streak} in a row. I’m proud of you, in a sleepy way."],
    streakLead: ["{partner}'s at {streak} days. That took effort.", "{streak} days in a row for {partner}. Say something kind."],
    streakStart: ["No streak yet. That’s okay. One task starts it."],
    ground: ["In for four. Hold. Out for four. Hold. I’ll stay.", "What’s under your hands right now? Start there."],
    nudge: ["Pick whichever task asks the least of you.", "A minute at the mirror is plenty on a hard day."],
    nudgeLead: ["Ask {partner} how today went before you add anything.", "A small task is fine. So is a night off."],
    assign: ["Leave some room in it. {partner} does better with room.", "Only put a due date on it if you mean it."],
  },
  sol: {
    home: [
      "There’s my favorite. Hi, {name}.",
      "Go make {partner} proud. I already am.",
      "I’ve been bragging about you all day.",
    ],
    homeLead: [
      "{name}! Go see what {partner}'s been up to.",
      "Tell {partner} what you noticed this week. Out loud.",
      "Have a look at the rewards. Somebody might’ve earned one.",
    ],
    done: ["Gorgeous. Done and dusted.", "That’s my {name}.", "Go tell {partner}. Show off a little."],
    streak: ["{streak} days! I’m telling everyone.", "{streak} in a row. Keep going and I’m growing a second horn."],
    streakLead: ["{partner}'s on {streak} days. You picked a good one.", "{streak} days running for {partner}. Go brag."],
    streakStart: ["No streak yet. Give me one task today and I’ll start bragging."],
    ground: ["Shine later. Breathe now.", "Come sit by me. Everything else can wait."],
    nudge: ["Do one thing so I can brag about it.", "Got points? Go cash some in."],
    nudgeLead: ["Give {partner} a reason to show off today.", "Care points come from saying well done. So go say it."],
    assign: ["Pick the one that’ll make {partner} feel chosen.", "Say you’ll be watching. {partner} loves that."],
  },
};

export function guideSpeech(guideId, event, ctx) {
  const known = Boolean(GUIDE_LINES[guideId]);
  const pack = known ? GUIDE_LINES[guideId] : GUIDE_LINES.lumen;
  let key = event;
  if (event === "streak" && (Number(ctx.streak) || 0) < 2) key = "streakStart";
  else if (ctx.side === "leading" && pack[`${event}Lead`]) key = `${event}Lead`;
  const pool = pack[key] || pack.home;
  const index = Math.abs(Number(ctx.tick) || 0) % pool.length;
  const text = fillLine(pool[index], ctx);
  return {
    guideId: known ? guideId : "lumen",
    event,
    text: text.charAt(0).toUpperCase() + text.slice(1),
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
    habit: false,
    custom: false,
    noteLabel: "",
    notePlaceholder: "",
    ...partial,
  };
}

export const TEMPLATES = [
  task({
    id: "daily-adventure",
    category: "adventure",
    title: "Today’s adventure",
    summary: "Pick one to three categories for the headspace you’re in. You get one task from each. No peeking until you lock in, and once you do, they’re yours.",
    points: 8,
    goalKeys: ["structure", "ritual"],
    completion: "adventure",
  }),
  task({
    id: "water",
    category: "self-care",
    title: "Drink your water",
    summary: "Drink the amount your D‑type set for you. Keep the bottle where you can see it.",
    points: 5,
    goalKeys: ["self-care", "ritual"],
    completion: "check",
    habit: true,
    noteLabel: "How much?",
    notePlaceholder: "8 glasses, or two full bottles",
  }),
  task({
    id: "meds",
    category: "self-care",
    title: "Take your meds",
    summary: "Take today’s meds, the way you’re meant to.",
    points: 5,
    goalKeys: ["self-care", "ritual"],
    completion: "check",
    habit: true,
    noteLabel: "Anything they should know?",
    notePlaceholder: "With breakfast, before bed",
  }),
  task({
    id: "meal",
    category: "self-care",
    title: "Eat a real meal",
    summary: "Sit down and eat something that counts as a meal. A handful of crackers over the sink doesn’t.",
    points: 5,
    goalKeys: ["self-care", "ritual"],
    completion: "check",
    habit: true,
  }),
  task({
    id: "bedtime",
    category: "self-care",
    title: "Bed on time",
    summary: "Be in bed by the time your D‑type set. Lights out, phone down.",
    points: 5,
    goalKeys: ["self-care", "ritual"],
    completion: "check",
    habit: true,
    noteLabel: "What time?",
    notePlaceholder: "In bed by 11",
  }),
  task({
    id: "own-task",
    category: "self-care",
    title: "Write your own",
    summary: "Anything you like. Give it a name and say what you want.",
    points: 10,
    completion: "check",
    custom: true,
    noteLabel: "What do you want them to do?",
  }),
  task({
    id: "shower-bath",
    category: "self-care",
    title: "Hot shower or bath",
    summary: "Take a hot shower or bath. Extra points for a bubble bath or shower steamers.",
    points: 15,
    bonuses: [{ id: "bubbles", label: "Bubble bath or shower steamer", points: 8 }],
    supplyHints: ["bubble", "bath", "steamer", "shower"],
    goalKeys: ["self-care", "ritual"],
    completion: "note",
  }),
  task({
    id: "self-care-trio",
    category: "self-care",
    title: "Self-care Sunday",
    summary: "Mix and match three things, like a long shower + face mask + home manicure. It doesn’t have to be Sunday.",
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
      "Tea and nowhere to be",
      "Clean sheets",
      "Something nice for your hair",
    ],
  }),
  task({
    id: "selfie",
    category: "self-care",
    title: "Cute selfie shoot",
    summary: "Take a cute selfie and send it to your D‑type. Make it a little photoshoot if you’re feeling it.",
    points: 18,
    goalKeys: ["connection", "celebration"],
    completion: "photos",
    photoMin: 1,
    photoMax: 3,
    photoLabel: "Up to three photos for your D‑type",
  }),
  task({
    id: "journal",
    category: "self-care",
    title: "Journal",
    summary: "Write about the prompt, then share whatever you want your D‑type to read.",
    points: 15,
    goalKeys: ["connection", "communication", "ritual"],
    completion: "note",
    promptPool: "journal",
  }),
  task({
    id: "mirror",
    category: "self-care",
    title: "A minute at the mirror",
    summary: "Look at yourself in the mirror for 1 minute. Write down everything you liked or felt neutral about. No being mean to yourself.",
    points: 12,
    goalKeys: ["self-care", "ritual"],
    completion: "timer",
    timerSeconds: 60,
  }),
  task({
    id: "walk",
    category: "self-care",
    title: "Go for a walk",
    summary: "Go for a walk, either outside, at a gym, or on a treadmill at home.",
    points: 15,
    goalKeys: ["self-care", "structure"],
    completion: "choices",
    choices: ["Outside", "Gym", "Treadmill at home"],
  }),
  task({
    id: "feel-good-song",
    category: "fun",
    title: "Play your feel-good song",
    summary: "Play a song that always makes you feel good. Extra points if you sing or dance!",
    points: 12,
    bonuses: [{ id: "move", label: "Sang or danced", points: 6 }],
    goalKeys: ["play", "celebration"],
    completion: "note",
  }),
  task({
    id: "phone-free-air",
    category: "self-care",
    title: "Step outside without your phone",
    summary: "Step outside without your phone and look around. Take a deep breath and pay attention to what’s around you.",
    points: 12,
    goalKeys: ["self-care", "ritual"],
    completion: "note",
  }),
  task({
    id: "hobby-hour",
    category: "fun",
    title: "An hour on your hobby",
    summary: "Do your current hobby for an hour, then tell your D‑type what you worked on.",
    points: 20,
    goalKeys: ["play", "structure"],
    completion: "note",
  }),
  task({
    id: "snack-cartoon",
    category: "fun",
    title: "Snack and a cartoon",
    summary: "Make a snack and watch your favorite cartoon.",
    points: 12,
    goalKeys: ["play"],
    completion: "note",
  }),
  task({
    id: "try-a-table",
    category: "fun",
    title: "That place you keep meaning to try",
    summary: "Go to a restaurant, cafe, or bar you’ve been meaning to try and order something.",
    points: 22,
    goalKeys: ["play", "celebration"],
    completion: "note",
  }),
  task({
    id: "plush-adventure",
    category: "fun",
    title: "Take a stuffie on an adventure",
    summary: "Take one on a hike and get pictures, or bring one to the movies. A small stuffie or another toy works too.",
    points: 18,
    goalKeys: ["play", "connection"],
    completion: "photos",
    photoMin: 0,
    photoMax: 3,
    photoLabel: "Pictures from the adventure, if you got any",
  }),
  task({
    id: "library",
    category: "fun",
    title: "Library run",
    summary: "Go to the library and check out a new book or movie. Sign up for a library card if you have to!",
    points: 18,
    goalKeys: ["play", "structure"],
    completion: "note",
  }),
  task({
    id: "new-kit",
    category: "fun",
    title: "Pick out a new kit",
    summary: "Go to the store and pick out a new kit to try. Hand embroidery, knitting, cross stitch, mosaic, jewelry making. Even a kids’ science kit would be fun.",
    points: 18,
    goalKeys: ["play"],
    completion: "note",
  }),
  task({
    id: "solo-movie",
    category: "fun",
    title: "Take yourself out for a movie",
    summary: "Take yourself out for a movie. Extra points if you get snacks and a drink!",
    points: 20,
    bonuses: [{ id: "snacks", label: "Snacks and a drink", points: 6 }],
    goalKeys: ["play", "celebration"],
    completion: "note",
  }),
  task({
    id: "catch-up",
    category: "fun",
    title: "Catch up with someone",
    summary: "Reach out to someone you haven’t spoken to in a while and catch up.",
    points: 15,
    goalKeys: ["communication", "connection"],
    completion: "note",
  }),
  task({
    id: "grounding-pause",
    category: "grounding",
    title: "Grounding pause",
    summary: "Box breathing or counting things. For when your D‑type is busy and you need to settle.",
    points: 10,
    goalKeys: ["self-care", "ritual"],
    completion: "breath",
  }),
  task({
    id: "anal-training",
    category: "spicy",
    title: "Anal training",
    summary: "A practice session at your own pace, with suggestions for your experience level. Stop whenever you want, and pass on it if today’s a no.",
    points: 20,
    goalKeys: ["connection"],
    completion: "note",
    consent: true,
  }),
  task({
    id: "scene-plan",
    category: "spicy",
    title: "Plan a scene you really want",
    summary: "Think of a scene you really want to have with your D‑type. Write out everything you’d need to make it work and what you want to happen, aftercare included. Then share it with them!",
    points: 20,
    goalKeys: ["connection", "communication"],
    completion: "note",
    consent: true,
  }),
  task({
    id: "three-nudes",
    category: "spicy",
    title: "Three nudes without overthinking it",
    summary: "Take 3 nudes without overthinking it and share them with your D‑type. They stay between the two of you, and you only send them if you want to.",
    points: 22,
    goalKeys: ["connection"],
    completion: "photos",
    photoMin: 3,
    photoMax: 3,
    photoLabel: "Three, for your D‑type’s eyes only",
    consent: true,
  }),
  task({
    id: "sexy-story",
    category: "spicy",
    title: "A story about the two of you",
    summary: "Write a sexy story about you and your D‑type and send it to them.",
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
  { id: "adventure", label: "Adventure", tint: "gold" },
  { id: "self-care", label: "Self-care", tint: "coral" },
  { id: "fun", label: "Fun", tint: "gold" },
  { id: "spicy", label: "Spicy", tint: "lilac" },
  { id: "grounding", label: "Grounding", tint: "teal" },
];

/** Sealed doors for the daily adventure. No task titles live here. */
export const ADVENTURE_SEALS = [
  { id: "self-care", label: "Self-care", headspace: "Tender", tease: "Something soft, with what you’ve already got." },
  { id: "fun", label: "Fun", headspace: "Playful", tease: "A little mischief that still counts." },
  { id: "grounding", label: "Grounding", headspace: "Quiet", tease: "Something slow for a loud day." },
  { id: "spicy", label: "Spicy", headspace: "Bold", tease: "Something with heat, if you’re in the mood." },
];

export function drawAdventureTasks(categories, options = {}) {
  const avoid = new Set(options.avoidIds || []);
  const random = options.random || Math.random;
  const drawn = [];
  for (const category of categories) {
    const drawable = TEMPLATES.filter((item) => item.category === category && !item.habit && !item.custom);
    const fresh = drawable.filter((item) => !avoid.has(item.id) && !drawn.some((picked) => picked.id === item.id));
    const pool = fresh.length ? fresh : drawable;
    if (!pool.length) return null;
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    drawn.push(pool[index]);
  }
  return drawn;
}
