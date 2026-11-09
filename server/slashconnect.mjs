import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ADVENTURE_SEALS,
  CATEGORIES,
  GOAL_OPTIONS,
  GUIDES,
  JOURNAL_PROMPTS,
  PRONOUN_PRESETS,
  ROLE_SUGGESTIONS,
  TEMPLATES,
  LEAD_TOKEN,
  coachingFor,
  drawAdventureTasks,
  guideSpeech,
  levelFor,
  templateById,
} from "./catalog.mjs";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEMO_PASSWORD = "together";

function nid() {
  return randomBytes(8).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function fail(status, error) {
  const err = new Error(error);
  err.status = status;
  throw err;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const passwordHash = scryptSync(password, salt, 32).toString("hex");
  return { passwordSalt: salt, passwordHash };
}

function passwordOk(user, password) {
  const next = scryptSync(String(password), user.passwordSalt, 32);
  const prev = Buffer.from(user.passwordHash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

function cleanText(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, max);
}

function pronounsFrom(input) {
  if (!input || typeof input !== "object") return null;
  const subject = cleanText(input.subject, 24).toLowerCase();
  const object = cleanText(input.object, 24).toLowerCase();
  const possessive = cleanText(input.possessive, 24).toLowerCase();
  const reflexive = cleanText(input.reflexive, 32).toLowerCase();
  if (!subject || !object || !possessive) return null;
  const label = cleanText(input.label, 40) || `${subject}/${object}`;
  return {
    label,
    subject,
    object,
    possessive,
    reflexive: reflexive || `${object}self`,
  };
}

function emptyDb() {
  return {
    demo: false,
    users: [],
    sessions: [],
    pair: null,
    invites: [],
    tasks: [],
    routines: [],
    goals: [],
    rewards: [],
    checkins: [],
  };
}

function validDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function dayShift(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function publicUser(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.passwordHash;
  delete copy.passwordSalt;
  delete copy.cheers;
  return copy;
}

function supplyNote(template, supplies, mine) {
  const hints = template.supplyHints || [];
  if (!hints.length) return "";
  const owned = (supplies || []).map((item) => item.toLowerCase());
  const matched = [];
  for (const hint of hints) {
    if (owned.some((item) => item.includes(hint) || hint.includes(item))) matched.push(hint);
  }
  if (matched.length) return `${mine ? "From your stash" : "In their stash"}: ${matched.join(", ")}.`;
  return mine
    ? "Nothing in your stash matches this one yet. Do a version with what you’ve got, or add what you use in your profile."
    : "Nothing in their stash matches this one yet.";
}

export function createSlashApp(options = {}) {
  const dataFile = options.dataFile || path.join(process.cwd(), "data", "slashconnect.json");
  const seedDemo = options.seedDemo !== false;
  let db = load();

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      if (!parsed || !Array.isArray(parsed.users)) return seedDemo ? seed(emptyDb()) : emptyDb();
      if (!Array.isArray(parsed.routines)) parsed.routines = [];
      // Task text saved before the leading partner's role title was used in it.
      for (const item of [...(parsed.tasks || []), ...parsed.routines]) {
        if (typeof item.summary === "string") item.summary = item.summary.replaceAll("D‑type", LEAD_TOKEN);
      }
      return parsed;
    } catch {
      return seedDemo ? seed(emptyDb()) : emptyDb();
    }
  }

  function save() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, dataFile);
  }

  function seed(base) {
    const rowanPass = hashPassword(DEMO_PASSWORD);
    const averyPass = hashPassword(DEMO_PASSWORD);
    const rowanId = "demo-rowan";
    const averyId = "demo-avery";
    const rowan = {
      id: rowanId,
      email: "rowan@demo.slashconnect",
      ...rowanPass,
      displayName: "Rowan Hale",
      adultConfirmed: true,
      demo: true,
      pronouns: { label: "she/her", subject: "she", object: "her", possessive: "her", reflexive: "herself" },
      gender: "woman",
      slashSide: "leading",
      roleTitle: "Domme",
      goals: ["connection", "structure", "accountability"],
      supplies: [],
      guideId: "lumen",
      avatar: { hue: 350, mark: "moon" },
      experienceLevel: "",
      onboardingComplete: true,
      points: 0,
      carePoints: 25,
      streak: 0,
      lastActiveDate: dayShift(-1),
      createdAt: nowIso(),
    };
    const avery = {
      id: averyId,
      email: "avery@demo.slashconnect",
      ...averyPass,
      displayName: "Avery Quinn",
      adultConfirmed: true,
      demo: true,
      pronouns: { label: "they/them", subject: "they", object: "them", possessive: "their", reflexive: "themself" },
      gender: "nonbinary",
      slashSide: "following",
      roleTitle: "Little",
      goals: ["connection", "structure", "accountability", "self-care"],
      supplies: ["face mask", "bubble bath", "journal", "cozy playlist", "nail polish"],
      guideId: "pip",
      avatar: { hue: 262, mark: "star" },
      experienceLevel: "some",
      onboardingComplete: true,
      points: 65,
      carePoints: 0,
      streak: 4,
      lastActiveDate: dayShift(-1),
      createdAt: nowIso(),
    };
    base.demo = true;
    base.users = [rowan, avery];
    base.pair = { id: "demo-pair", members: [rowanId, averyId], createdAt: nowIso() };
    base.goals = [
      { id: "goal-connection", goalKey: "connection", title: "Deeper connection", detail: GOAL_OPTIONS[0].detail, target: 8, progress: 3, createdBy: rowanId },
      { id: "goal-structure", goalKey: "structure", title: "Structure", detail: GOAL_OPTIONS[1].detail, target: 10, progress: 4, createdBy: rowanId },
      { id: "goal-account", goalKey: "accountability", title: "Accountability", detail: GOAL_OPTIONS[2].detail, target: 10, progress: 4, createdBy: averyId },
      { id: "goal-care", goalKey: "self-care", title: "Self-care", detail: GOAL_OPTIONS[3].detail, target: 6, progress: 2, createdBy: averyId },
    ];
    const done = (id, templateId, daysAgo, extra) => {
      const template = templateById(templateId);
      return {
        id,
        templateId,
        category: template.category,
        title: template.title,
        summary: template.summary,
        note: "",
        prompt: template.promptPool === "journal" ? JOURNAL_PROMPTS[0] : "",
        points: template.points,
        bonuses: template.bonuses,
        assignedBy: rowanId,
        assignedTo: averyId,
        status: "done",
        dueDate: "",
        createdAt: nowIso(),
        completedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        completionDate: dayShift(-daysAgo),
        completion: extra,
        acknowledgedAt: daysAgo > 0 ? nowIso() : null,
      };
    };
    base.tasks = [
      done("task-song", "feel-good-song", 1, { note: "Kitchen song, obviously. Danced until the pasta boiled over a bit.", bonuses: ["move"], photos: [], checklist: [], choice: "" }),
      done("task-walk", "walk", 2, { note: "Did the loop around the block after work. It was cold!", bonuses: [], photos: [], checklist: [], choice: "Outside" }),
      done("task-mirror", "mirror", 3, { note: "I liked my face in that light. Shoulders were fine today.", bonuses: [], photos: [], checklist: [], choice: "" }),
      done("task-selfie", "selfie", 4, { note: "Sent you the sunny windowsill ones.", bonuses: [], photos: [], checklist: [], choice: "" }),
      {
        id: "task-shower",
        templateId: "shower-bath",
        category: "self-care",
        title: "Hot shower or bath",
        summary: templateById("shower-bath").summary,
        note: "Use the bubble bath I know you’re saving. That’s what it’s for.",
        prompt: "",
        points: 15,
        bonuses: templateById("shower-bath").bonuses,
        assignedBy: rowanId,
        assignedTo: averyId,
        status: "open",
        dueDate: dayShift(0),
        createdAt: nowIso(),
        completedAt: null,
        completionDate: "",
        completion: null,
        acknowledgedAt: null,
      },
      {
        id: "task-journal",
        templateId: "journal",
        category: "self-care",
        title: "Journal",
        summary: templateById("journal").summary,
        note: "Share as much or as little as you like. I’ll read every word.",
        prompt: "What do you want your partner to notice?",
        points: 15,
        bonuses: [],
        assignedBy: rowanId,
        assignedTo: averyId,
        status: "open",
        dueDate: "",
        createdAt: nowIso(),
        completedAt: null,
        completionDate: "",
        completion: null,
        acknowledgedAt: null,
      },
      {
        id: "task-plush",
        templateId: "plush-adventure",
        category: "fun",
        title: "Take a stuffie on an adventure",
        summary: templateById("plush-adventure").summary,
        note: "The little fox gets to come along. I want a picture.",
        prompt: "",
        points: 18,
        bonuses: [],
        assignedBy: rowanId,
        assignedTo: averyId,
        status: "open",
        dueDate: dayShift(2),
        createdAt: nowIso(),
        completedAt: null,
        completionDate: "",
        completion: null,
        acknowledgedAt: null,
      },
      {
        id: "task-scene",
        templateId: "scene-plan",
        category: "spicy",
        title: "Plan a scene you really want",
        summary: templateById("scene-plan").summary,
        note: "Don’t leave out aftercare. If it’s not a yes today, pass on it and tell me.",
        prompt: "",
        points: 20,
        bonuses: [],
        assignedBy: rowanId,
        assignedTo: averyId,
        status: "open",
        dueDate: "",
        createdAt: nowIso(),
        completedAt: null,
        completionDate: "",
        completion: null,
        acknowledgedAt: null,
      },
      {
        id: "task-adventure",
        templateId: "daily-adventure",
        category: "adventure",
        title: "Today’s adventure",
        summary: templateById("daily-adventure").summary,
        note: "Pick what fits today. No peeking.",
        prompt: "",
        points: 8,
        bonuses: [],
        assignedBy: rowanId,
        assignedTo: averyId,
        status: "open",
        dueDate: dayShift(0),
        createdAt: nowIso(),
        completedAt: null,
        completionDate: "",
        completion: null,
        acknowledgedAt: null,
        adventure: { stage: "sealed", day: dayShift(0), categories: [], locked: [] },
      },
    ];
    const daily = (id, templateId, note) => {
      const template = templateById(templateId);
      base.routines.push({
        id: `routine-${id}`,
        templateId,
        category: template.category,
        title: template.title,
        summary: template.summary,
        note,
        prompt: "",
        points: template.points,
        bonuses: template.bonuses,
        consent: false,
        assignedBy: rowanId,
        assignedTo: averyId,
        createdAt: nowIso(),
        stoppedAt: null,
      });
      base.tasks.push(routineInstance(base.routines[base.routines.length - 1], dayShift(0), `task-${id}`));
    };
    daily("water", "water", "Two full bottles. The big ones.");
    daily("meds", "meds", "With breakfast, please.");
    base.rewards = [
      {
        id: "reward-movie",
        title: "You pick the movie on our next call",
        detail: "Avery picks, Rowan watches without complaining. Snacks optional.",
        cost: 30,
        proposedBy: rowanId,
        status: "agreed",
        agreedBy: [rowanId, averyId],
        requestedBy: "",
        grantedBy: "",
        createdAt: nowIso(),
        grantedAt: "",
      },
      {
        id: "reward-note",
        title: "A voice note from Rowan about this week",
        detail: "The things Rowan noticed, said out loud.",
        cost: 20,
        proposedBy: averyId,
        status: "agreed",
        agreedBy: [averyId, rowanId],
        requestedBy: "",
        grantedBy: "",
        createdAt: nowIso(),
        grantedAt: "",
      },
      {
        id: "reward-breakfast",
        title: "Breakfast in bed, next visit",
        detail: "Avery picks the menu. Saved for when you’re in the same place.",
        cost: 80,
        proposedBy: averyId,
        status: "proposed",
        agreedBy: [averyId],
        requestedBy: "",
        grantedBy: "",
        createdAt: nowIso(),
        grantedAt: "",
      },
    ];
    base.checkins = [
      {
        id: "check-hello",
        fromUserId: rowanId,
        kind: "hello",
        note: "I’m around after dinner. Come tell me about your day.",
        createdAt: nowIso(),
        seenBy: [],
      },
    ];
    base.invites = [];
    base.sessions = [];
    return base;
  }

  function userById(id) {
    return db.users.find((user) => user.id === id) || null;
  }

  function userByEmail(email) {
    const key = String(email || "").trim().toLowerCase();
    return db.users.find((user) => user.email === key) || null;
  }

  function userFromToken(token) {
    if (!token) return null;
    const session = db.sessions.find((item) => item.token === token);
    if (!session) return null;
    return userById(session.userId);
  }

  function partnerOf(user) {
    if (!user || !db.pair) return null;
    const otherId = db.pair.members.find((id) => id !== user.id);
    return userById(otherId);
  }

  function followingUser() {
    return db.users.find((user) => user.slashSide === "following") || null;
  }

  /** The role title the leading partner chose. Task text uses it wherever it names them. */
  function leadRole() {
    return cleanText(db.users.find((item) => item.slashSide === "leading")?.roleTitle, 40) || "partner";
  }

  function nameLead(text) {
    return String(text || "").replaceAll(LEAD_TOKEN, leadRole());
  }

  function meta(viewer) {
    const leading = viewer?.slashSide === "leading";
    return {
      guides: GUIDES,
      goals: GOAL_OPTIONS,
      pronouns: PRONOUN_PRESETS,
      roles: ROLE_SUGGESTIONS,
      categories: CATEGORIES,
      seals: ADVENTURE_SEALS,
      templates: leading ? TEMPLATES.map((item) => ({ ...item, summary: nameLead(item.summary), photoLabel: nameLead(item.photoLabel) })) : [],
      journalPrompts: JOURNAL_PROMPTS,
      levelLadder: ["Spark", "Glow", "Flame", "Hearth", "Beacon", "Constellation"],
    };
  }

  function routineInstance(routine, day, id = nid()) {
    return {
      id,
      templateId: routine.templateId,
      category: routine.category,
      title: routine.title,
      summary: routine.summary,
      note: routine.note,
      prompt: routine.prompt,
      points: routine.points,
      bonuses: routine.bonuses,
      consent: routine.consent,
      assignedBy: routine.assignedBy,
      assignedTo: routine.assignedTo,
      status: "open",
      dueDate: "",
      createdAt: nowIso(),
      completedAt: null,
      completionDate: "",
      completion: null,
      acknowledgedAt: null,
      adventure: null,
      routineId: routine.id,
      day,
    };
  }

  /**
   * A daily task belongs to the following partner's day, so only their requests
   * move it on. The two of them may be in different time zones.
   */
  function rollDaily(user, today) {
    let changed = false;
    if (user.lastSeenDay !== today) {
      user.lastSeenDay = today;
      changed = true;
    }
    for (const routine of db.routines) {
      if (routine.stoppedAt || routine.assignedTo !== user.id) continue;
      const instances = db.tasks.filter((item) => item.routineId === routine.id);
      const open = instances.find((item) => item.status === "open");
      if (open) {
        if (open.day !== today) {
          open.day = today;
          changed = true;
        }
        continue;
      }
      const lastClosed = instances.reduce((latest, item) => (item.day > latest ? item.day : latest), "");
      if (today > lastClosed) {
        db.tasks.push(routineInstance(routine, today));
        changed = true;
      }
    }
    return changed;
  }

  function presentRoutines() {
    const rows = [];
    for (const routine of db.routines) {
      if (routine.stoppedAt) continue;
      const instances = db.tasks.filter((item) => item.routineId === routine.id);
      const current =
        instances.find((item) => item.status === "open") ||
        instances.slice().sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
      if (!current) continue;
      rows.push({
        id: routine.id,
        taskId: current.id,
        title: routine.title,
        category: routine.category,
        points: routine.points,
        status: current.status,
        day: current.day || "",
        daysDone: instances.filter((item) => item.status === "done").length,
      });
    }
    return rows;
  }

  function presentTask(taskItem, viewer) {
    const template = templateById(taskItem.templateId);
    const routine = taskItem.routineId ? db.routines.find((item) => item.id === taskItem.routineId) : null;
    const assignee = userById(taskItem.assignedTo);
    const coaching = coachingFor(taskItem.templateId, assignee?.experienceLevel || "new");
    return {
      ...taskItem,
      summary: nameLead(taskItem.summary),
      supplyNote: supplyNote(template || { supplyHints: [] }, assignee?.supplies || [], viewer ? taskItem.assignedTo === viewer.id : true),
      coaching: coaching.map(nameLead),
      checklistIdeas: template?.checklistIdeas || [],
      checklistCount: template?.checklistCount || 0,
      completionKind: template?.completion || "note",
      timerSeconds: template?.timerSeconds || 0,
      photoMin: template?.photoMin || 0,
      photoMax: template?.photoMax || 0,
      photoLabel: nameLead(template?.photoLabel),
      choices: template?.choices || [],
      consent: Boolean(taskItem.consent ?? template?.consent),
      repeat: taskItem.routineId ? "daily" : "once",
      routineActive: Boolean(routine && !routine.stoppedAt),
      category: taskItem.category,
      mine: viewer ? taskItem.assignedTo === viewer.id : false,
      adventure: taskItem.templateId === "daily-adventure"
        ? {
            stage: taskItem.adventure?.stage === "locked" ? "locked" : "sealed",
            day: taskItem.adventure?.day || "",
            categories: taskItem.adventure?.categories || [],
            locked: taskItem.adventure?.stage === "locked" ? taskItem.adventure.locked || [] : [],
          }
        : null,
    };
  }

  function guideContext(user) {
    const partner = partnerOf(user);
    const follower = followingUser();
    return {
      name: user.displayName.split(" ")[0],
      partner: partner ? partner.displayName.split(" ")[0] : "your partner",
      role: user.roleTitle || "partner",
      side: user.slashSide,
      partnerRole: partner?.roleTitle || "partner",
      streak: follower?.streak || user.streak || 0,
      points: follower?.points || user.points || 0,
      tick: Date.now() % 3,
    };
  }

  function bundle(user, extra = {}) {
    const partner = partnerOf(user);
    const follower = followingUser();
    const scoreUser = follower || user;
    const level = levelFor(scoreUser.points || 0);
    const tasks = db.tasks
      .map((item) => presentTask(item, user))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "open" ? -1 : 1;
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
    return {
      me: publicUser(user),
      partner: publicUser(partner),
      pair: db.pair,
      demo: Boolean(db.demo),
      tasks,
      routines: presentRoutines(),
      cheer: presentCheer(user),
      goals: db.goals,
      rewards: db.rewards,
      checkins: db.checkins.slice().reverse(),
      invites: db.invites.filter((invite) => invite.status === "open"),
      stats: {
        points: scoreUser.points || 0,
        carePoints: db.users.find((item) => item.slashSide === "leading")?.carePoints || 0,
        streak: scoreUser.streak || 0,
        level,
        openCount: tasks.filter((item) => item.status === "open").length,
        doneCount: tasks.filter((item) => item.status === "done").length,
      },
      guide: guideSpeech(user.guideId || "lumen", "home", { ...guideContext(user), tick: 0 }),
      meta: meta(user),
      ...extra,
    };
  }

  /** Queues a celebration for the partner. It waits until their app says it was seen. */
  function queueCheer(user, cheer) {
    if (!user) return;
    user.cheers = [...(user.cheers || []), { id: nid(), at: nowIso(), ...cheer }].slice(-20);
  }

  /** Folds everything of the oldest waiting kind into one celebration, so three well dones are one moment. */
  function presentCheer(user) {
    const waiting = user.cheers || [];
    if (!waiting.length) return null;
    const group = waiting.filter((item) => item.kind === waiting[0].kind);
    const from = (userById(waiting[0].from)?.displayName || "Your partner").split(" ")[0];
    const names = group.map((item) => `“${item.what}”`);
    const listed = names.length > 2 ? `${names.slice(0, 2).join(", ")}, and ${names.length - 2} more` : names.join(" and ");
    const ids = group.map((item) => item.id);
    if (waiting[0].kind === "reward") {
      return { ids, kind: "reward", from, title: group.length === 1 ? group[0].what : "Rewards granted", detail: group.length === 1 ? `${from} said yes. Enjoy it.` : `${from} said yes to ${listed}.` };
    }
    return { ids, kind: "praise", from, title: "Well done", detail: `${from} saw you finish ${listed}.` };
  }

  function clearCheers(user, ids) {
    const seen = new Set(Array.isArray(ids) ? ids.map(String) : []);
    const before = (user.cheers || []).length;
    user.cheers = (user.cheers || []).filter((item) => !seen.has(item.id));
    return user.cheers.length !== before;
  }

  function issueSession(user) {
    const token = randomBytes(24).toString("hex");
    db.sessions.push({ token, userId: user.id, createdAt: nowIso() });
    save();
    return token;
  }

  function requireUser(token) {
    const user = userFromToken(token);
    if (!user) fail(401, "You’ve been signed out. Sign back in.");
    return user;
  }

  function ensureGoals(user) {
    for (const key of user.goals || []) {
      if (db.goals.some((goal) => goal.goalKey === key)) continue;
      const spec = GOAL_OPTIONS.find((goal) => goal.key === key);
      if (!spec) continue;
      db.goals.push({
        id: nid(),
        goalKey: key,
        title: spec.title,
        detail: spec.detail,
        target: spec.target,
        progress: 0,
        createdBy: user.id,
      });
    }
  }

  function bumpGoals(template) {
    const keys = new Set(template.goalKeys || []);
    for (const goal of db.goals) {
      const counts =
        goal.goalKey === "structure" ||
        goal.goalKey === "accountability" ||
        goal.goalKey === "custom" ||
        keys.has(goal.goalKey) ||
        goal.goalKey === template.category;
      if (!counts) continue;
      goal.progress = Math.min(goal.target, (goal.progress || 0) + 1);
    }
  }

  function applyStreak(user, clientDate) {
    const today = /^\d{4}-\d{2}-\d{2}$/.test(clientDate) ? clientDate : new Date().toISOString().slice(0, 10);
    const prev = user.lastActiveDate || "";
    if (prev === today) return { streak: user.streak || 0, extended: false, today };
    const prevDate = prev ? new Date(`${prev}T00:00:00Z`) : null;
    const todayDate = new Date(`${today}T00:00:00Z`);
    const gap = prevDate ? Math.round((todayDate - prevDate) / 86400000) : 99;
    user.streak = gap === 1 ? (user.streak || 0) + 1 : 1;
    user.lastActiveDate = today;
    return { streak: user.streak, extended: true, milestone: [3, 7, 14, 30].includes(user.streak), today };
  }

  function createUser({ email, password, displayName }) {
    const key = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) fail(400, "That doesn’t look like an email address.");
    if (String(password || "").length < 6) fail(400, "Passwords need at least 6 characters.");
    const name = cleanText(displayName, 40);
    if (name.length < 1) fail(400, "Add the name you want your partner to see.");
    if (userByEmail(key)) fail(409, "That email’s already signed up here. Try signing in.");
    if (db.users.length >= 2) {
      fail(409, db.demo
        ? "The demo pair has both spots. Tap “Start your own dynamic” to sign up."
        : "Both spots are taken. SlashConnect is for two.");
    }
    const user = {
      id: nid(),
      email: key,
      ...hashPassword(password),
      displayName: name,
      adultConfirmed: true,
      demo: false,
      pronouns: null,
      gender: "",
      slashSide: "",
      roleTitle: "",
      goals: [],
      supplies: [],
      guideId: "",
      avatar: { hue: 18, mark: "heart" },
      experienceLevel: "",
      onboardingComplete: false,
      points: 0,
      carePoints: 0,
      streak: 0,
      lastActiveDate: "",
      createdAt: nowIso(),
    };
    db.users.push(user);
    db.demo = false;
    return user;
  }

  async function dispatch({ method, url, token, body, clientDate }) {
    const parsed = new URL(url, "http://127.0.0.1");
    const parts = parsed.pathname.split("/").filter(Boolean);
    const route = `${method.toUpperCase()} /${parts.join("/")}`;

    if (route === "GET /api/health") {
      return { status: 200, body: { ok: true, demo: Boolean(db.demo), people: db.users.length } };
    }
    if (route === "GET /api/meta") return { status: 200, body: meta(null) };

    if (route === "POST /api/household/reset") {
      if (body?.confirm !== "reset-demo") fail(400, "Confirm the reset first.");
      if (!db.demo && db.users.some((user) => !user.demo)) {
        fail(409, "There’s a real pair on this computer already, so nothing was wiped.");
      }
      db = emptyDb();
      save();
      return { status: 200, body: { ok: true, demo: false } };
    }

    if (route === "POST /api/demo/login") {
      if (!db.demo) fail(404, "The demo pair isn’t here anymore.");
      const side = body?.who === "leading" ? "leading" : body?.who === "following" ? "following" : "";
      if (!side) fail(400, "Pick Rowan or Avery.");
      const user = db.users.find((item) => item.slashSide === side && item.demo);
      if (!user) fail(404, "Can’t find that demo profile.");
      const sessionToken = issueSession(user);
      return { status: 200, body: { token: sessionToken, ...bundle(user) } };
    }

    if (route === "POST /api/auth/register") {
      if (body?.adultConfirmed !== true) fail(400, "SlashConnect is 18 and over. Tick the box to confirm.");
      const user = createUser(body || {});
      try {
        if (body?.inviteCode) acceptInvite(user, body.inviteCode);
      } catch (error) {
        db.users = db.users.filter((item) => item.id !== user.id);
        throw error;
      }
      const sessionToken = issueSession(user);
      return { status: 201, body: { token: sessionToken, ...bundle(user) } };
    }

    if (route === "POST /api/auth/login") {
      const user = userByEmail(body?.email);
      if (!user || !passwordOk(user, body?.password || "")) fail(401, "That email and password don’t match.");
      const sessionToken = issueSession(user);
      return { status: 200, body: { token: sessionToken, ...bundle(user) } };
    }

    if (route === "POST /api/auth/logout") {
      db.sessions = db.sessions.filter((session) => session.token !== token);
      save();
      return { status: 200, body: { ok: true } };
    }

    if (route === "GET /api/invites/preview") {
      const code = String(parsed.searchParams.get("code") || "").toUpperCase();
      const invite = db.invites.find((item) => item.code === code && item.status === "open");
      if (!invite) fail(404, "That invite isn’t open anymore.");
      const from = userById(invite.fromUserId);
      return {
        status: 200,
        body: {
          code,
          fromName: from?.displayName || "Your partner",
          roleTitle: from?.roleTitle || "",
          pronouns: from?.pronouns?.label || "",
          slashSide: from?.slashSide || "",
          gender: from?.gender || "",
        },
      };
    }

    const user = requireUser(token);
    const today = validDay(clientDate) || validDay(body?.clientDate);
    if (today && rollDaily(user, today)) save();

    if (route === "GET /api/session") return { status: 200, body: bundle(user) };

    if (route === "PATCH /api/profile") {
      applyProfile(user, body || {});
      ensureGoals(user);
      save();
      return { status: 200, body: bundle(user) };
    }

    if (route === "POST /api/cheers/seen") {
      if (clearCheers(user, body?.ids)) save();
      return { status: 200, body: bundle(user) };
    }

    if (route === "POST /api/invites") {
      const invite = openInvite(user, body || {});
      save();
      return { status: 201, body: { invite, ...bundle(user) } };
    }

    if (route === "POST /api/invites/accept") {
      acceptInvite(user, body?.code);
      save();
      return { status: 200, body: bundle(user, { celebration: { kind: "pair", title: "You’re paired", detail: "It’s the two of you now." } }) };
    }

    if (route === "POST /api/adventure/start") {
      const created = startAdventure(user, body || {});
      save();
      return { status: 201, body: bundle(user, { task: presentTask(created, user) }) };
    }

    if (route === "POST /api/tasks") {
      const created = assignTask(user, body || {});
      save();
      return { status: 201, body: bundle(user, { task: presentTask(created, user) }) };
    }

    const taskMatch = parts[0] === "api" && parts[1] === "tasks" && parts[2];
    if (taskMatch && method.toUpperCase() === "POST" && parts[3]) {
      const taskItem = db.tasks.find((item) => item.id === parts[2]);
      if (!taskItem) fail(404, "Can’t find that task.");
      let celebration = null;
      if (parts[3] === "complete") celebration = completeTask(user, taskItem, body || {});
      else if (parts[3] === "lock") celebration = lockAdventure(user, taskItem, body || {});
      else if (parts[3] === "skip") skipTask(user, taskItem, body || {});
      else if (parts[3] === "acknowledge") acknowledgeTask(user, taskItem);
      else if (parts[3] === "remove") removeTask(user, taskItem);
      else if (parts[3] === "stop") stopRoutine(user, taskItem);
      else fail(404, "Unknown task action.");
      save();
      return { status: 200, body: bundle(user, celebration ? { celebration } : {}) };
    }

    if (route === "POST /api/goals") {
      const title = cleanText(body?.title, 80);
      if (title.length < 2) fail(400, "Give the goal a name.");
      const target = Math.min(50, Math.max(1, Number(body?.target) || 5));
      db.goals.push({
        id: nid(),
        goalKey: "custom",
        title,
        detail: cleanText(body?.detail, 180),
        target,
        progress: 0,
        createdBy: user.id,
      });
      save();
      return { status: 201, body: bundle(user) };
    }

    if (parts[1] === "goals" && parts[2] && parts[3] === "step" && method.toUpperCase() === "POST") {
      const goal = db.goals.find((item) => item.id === parts[2]);
      if (!goal) fail(404, "Can’t find that goal.");
      goal.progress = Math.min(goal.target, (goal.progress || 0) + 1);
      save();
      return { status: 200, body: bundle(user) };
    }

    if (route === "POST /api/rewards") {
      const title = cleanText(body?.title, 80);
      if (title.length < 2) fail(400, "Give the reward a name.");
      const cost = Math.min(500, Math.max(5, Number(body?.cost) || 20));
      db.rewards.push({
        id: nid(),
        title,
        detail: cleanText(body?.detail, 240),
        cost,
        proposedBy: user.id,
        status: "proposed",
        agreedBy: [user.id],
        requestedBy: "",
        grantedBy: "",
        createdAt: nowIso(),
        grantedAt: "",
      });
      save();
      return { status: 201, body: bundle(user) };
    }

    if (parts[1] === "rewards" && parts[2] && parts[3] && method.toUpperCase() === "POST") {
      const reward = db.rewards.find((item) => item.id === parts[2]);
      if (!reward) fail(404, "Can’t find that reward.");
      let celebration = null;
      if (parts[3] === "agree") agreeReward(user, reward);
      else if (parts[3] === "request") requestReward(user, reward);
      else if (parts[3] === "grant") celebration = grantReward(user, reward);
      else if (parts[3] === "withdraw") withdrawReward(user, reward);
      else fail(404, "Unknown reward action.");
      save();
      return { status: 200, body: bundle(user, celebration ? { celebration } : {}) };
    }

    if (route === "POST /api/checkins/see") {
      for (const note of db.checkins) {
        if (!note.seenBy.includes(user.id)) note.seenBy.push(user.id);
      }
      save();
      return { status: 200, body: bundle(user) };
    }

    if (route === "POST /api/checkins") {
      const note = cleanText(body?.note, 400);
      if (note.length < 1) fail(400, "Write something first.");
      const kind = body?.kind === "grounding" ? "grounding" : "hello";
      db.checkins.push({
        id: nid(),
        fromUserId: user.id,
        kind,
        note,
        createdAt: nowIso(),
        seenBy: [user.id],
      });
      if (db.checkins.length > 40) db.checkins = db.checkins.slice(-40);
      save();
      return { status: 201, body: bundle(user) };
    }

    if (parts[1] === "checkins" && parts[2] && parts[3] === "see" && method.toUpperCase() === "POST") {
      const note = db.checkins.find((item) => item.id === parts[2]);
      if (!note) fail(404, "That note’s gone.");
      if (!note.seenBy.includes(user.id)) note.seenBy.push(user.id);
      save();
      return { status: 200, body: bundle(user) };
    }

    if (route === "POST /api/guide/nudge") {
      const event = ["home", "done", "streak", "ground", "nudge", "assign"].includes(body?.event) ? body.event : "nudge";
      const line = guideSpeech(user.guideId || "lumen", event, { ...guideContext(user), tick: Number(body?.tick) || Date.now() });
      return { status: 200, body: { line } };
    }

    fail(404, "That path is not part of SlashConnect.");
  }

  function applyProfile(user, body) {
    if (body.pronouns) {
      const pronouns = pronounsFrom(body.pronouns);
      if (!pronouns) fail(400, "Fill in all three pronouns.");
      user.pronouns = pronouns;
    }
    if (typeof body.gender === "string") user.gender = cleanText(body.gender, 60);
    if (typeof body.displayName === "string") {
      const name = cleanText(body.displayName, 40);
      if (name) user.displayName = name;
    }
    if (body.slashSide === "leading" || body.slashSide === "following") {
      const partner = partnerOf(user);
      if (partner && partner.slashSide === body.slashSide) {
        const sideName = body.slashSide === "leading" ? "leading" : "following";
        fail(409, `Your partner already has the ${sideName} side. You need one of each.`);
      }
      user.slashSide = body.slashSide;
    }
    if (typeof body.roleTitle === "string") user.roleTitle = cleanText(body.roleTitle, 40);
    if (Array.isArray(body.goals)) {
      user.goals = [...new Set(body.goals.map((key) => cleanText(key, 40)).filter((key) => GOAL_OPTIONS.some((goal) => goal.key === key)))];
    }
    if (Array.isArray(body.supplies)) {
      user.supplies = [...new Set(body.supplies.map((item) => cleanText(item, 40)).filter(Boolean))].slice(0, 24);
    }
    if (typeof body.guideId === "string" && GUIDES.some((guide) => guide.id === body.guideId)) user.guideId = body.guideId;
    if (body.avatar && typeof body.avatar === "object") {
      const hue = Math.max(0, Math.min(360, Number(body.avatar.hue) || 0));
      const mark = cleanText(body.avatar.mark, 16) || "heart";
      user.avatar = { hue, mark };
    }
    if (["new", "some", "experienced", ""].includes(body.experienceLevel)) user.experienceLevel = body.experienceLevel;
    const ready = user.pronouns && user.slashSide && user.roleTitle && user.goals.length > 0 && user.guideId;
    if (body.onboardingComplete === true) {
      if (!ready) fail(400, "Almost. You still need pronouns, a side, a title, a goal, and a stuffie.");
      user.onboardingComplete = true;
    }
  }

  function openInvite(user, body) {
    if (!user.onboardingComplete) fail(400, "Finish setting up before you send an invite.");
    if (db.pair && db.pair.members.length >= 2) fail(409, "You two are already paired.");
    if (db.users.length >= 2) fail(409, "Both spots are taken. SlashConnect is for two.");
    const channel = body.channel === "text" || body.channel === "email" ? body.channel : "link";
    const contact = cleanText(body.contact, 80);
    let invite = db.invites.find((item) => item.fromUserId === user.id && item.status === "open");
    if (!invite) {
      invite = {
        code: inviteCode(),
        fromUserId: user.id,
        channel,
        contact,
        status: "open",
        createdAt: nowIso(),
        acceptedBy: "",
      };
      db.invites.push(invite);
    } else {
      invite.channel = channel;
      invite.contact = contact;
    }
    return { code: invite.code, channel: invite.channel, contact: invite.contact };
  }

  function acceptInvite(user, rawCode) {
    const code = cleanText(rawCode, 12).toUpperCase();
    const invite = db.invites.find((item) => item.code === code && item.status === "open");
    if (!invite) fail(404, "That code isn’t open. Check it with your partner.");
    if (invite.fromUserId === user.id) fail(400, "That’s your own code. It’s for your partner.");
    if (db.pair) fail(409, "Both spots are taken. SlashConnect is for two.");
    const host = userById(invite.fromUserId);
    if (!host) fail(404, "Whoever sent that invite isn’t here anymore.");
    if (user.slashSide && host.slashSide && user.slashSide === host.slashSide) {
      fail(409, "You both picked the same side of the slash. One of you leads and one follows, so change yours in setup and try the code again.");
    }
    if (!user.slashSide && host.slashSide) {
      user.slashSide = host.slashSide === "leading" ? "following" : "leading";
    }
    invite.status = "accepted";
    invite.acceptedBy = user.id;
    db.pair = { id: nid(), members: [host.id, user.id], createdAt: nowIso() };
    for (const taskItem of db.tasks) {
      if (!taskItem.assignedTo) taskItem.assignedTo = user.slashSide === "following" ? user.id : host.id;
    }
  }

  function clientDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : new Date().toISOString().slice(0, 10);
  }

  function openAdventure(userId) {
    return db.tasks.find((item) => item.templateId === "daily-adventure" && item.assignedTo === userId && item.status === "open") || null;
  }

  function startAdventure(user, body) {
    if (user.slashSide !== "following") fail(403, "Today’s adventure is for the following partner to start.");
    const day = clientDay(body.clientDate);
    if (openAdventure(user.id)) fail(409, "There’s already an adventure waiting.");
    const already = db.tasks.find((item) => item.templateId === "daily-adventure" && item.assignedTo === user.id && item.status === "done" && item.adventure?.day === day);
    if (already) fail(409, "You already locked in today’s adventure. Nice try.");
    const leader = db.users.find((item) => item.slashSide === "leading");
    const template = templateById("daily-adventure");
    const created = {
      id: nid(),
      templateId: template.id,
      category: template.category,
      title: template.title,
      summary: template.summary,
      note: "Pick what fits today. No peeking.",
      prompt: "",
      points: template.points,
      bonuses: [],
      assignedBy: leader?.id || user.id,
      assignedTo: user.id,
      status: "open",
      dueDate: day,
      createdAt: nowIso(),
      completedAt: null,
      completionDate: "",
      completion: null,
      acknowledgedAt: null,
      adventure: { stage: "sealed", day, categories: [], locked: [] },
    };
    db.tasks.push(created);
    return created;
  }

  function lockAdventure(user, taskItem, body) {
    if (taskItem.templateId !== "daily-adventure") fail(404, "That’s not an adventure.");
    if (taskItem.assignedTo !== user.id) fail(403, "Hands off. Your partner picks the categories.");
    if (taskItem.status !== "open" || taskItem.adventure?.stage === "locked") fail(409, "Already locked in. No take-backs.");
    const allowed = new Set(ADVENTURE_SEALS.map((seal) => seal.id));
    const categories = [...new Set((Array.isArray(body.categories) ? body.categories : []).filter((id) => allowed.has(id)))];
    if (categories.length < 1 || categories.length > 3) fail(400, "Pick one, two, or three categories.");
    const avoid = db.tasks.filter((item) => item.assignedTo === user.id && item.status === "open").map((item) => item.templateId);
    const drawn = drawAdventureTasks(categories, { avoidIds: avoid });
    if (!drawn || drawn.length !== categories.length) fail(409, "Nothing left to draw from those categories.");
    const day = clientDay(body.clientDate);
    const locked = drawn.map((template) => {
      const prompt = template.promptPool === "journal" ? JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)] : "";
      const created = {
        id: nid(),
        templateId: template.id,
        category: template.category,
        title: template.title,
        summary: template.summary,
        note: "From today’s adventure. You picked the category, so it’s yours.",
        prompt,
        points: template.points,
        bonuses: template.bonuses,
        assignedBy: taskItem.assignedBy,
        assignedTo: user.id,
        status: "open",
        dueDate: day,
        createdAt: nowIso(),
        completedAt: null,
        completionDate: "",
        completion: null,
        acknowledgedAt: null,
        adventureId: taskItem.id,
      };
      db.tasks.push(created);
      return { taskId: created.id, templateId: template.id, title: template.title, category: template.category };
    });
    const titles = locked.map((item) => item.title).join(" + ");
    taskItem.adventure = { stage: "locked", day, categories, locked };
    taskItem.status = "done";
    taskItem.completedAt = nowIso();
    taskItem.completionDate = day;
    taskItem.completion = { note: `Locked in: ${titles}`, bonuses: [], photos: [], checklist: [], choice: "" };
    const before = levelFor(user.points || 0);
    user.points = (user.points || 0) + (taskItem.points || 0);
    const after = levelFor(user.points);
    applyStreak(user, day);
    const adventureTemplate = templateById("daily-adventure");
    if (adventureTemplate) bumpGoals(adventureTemplate);
    return {
      kind: after.name !== before.name ? "level" : "task",
      title: "Locked in",
      detail: after.name !== before.name ? `${titles}. That also got you to ${after.name}!` : titles,
      points: taskItem.points || 0,
    };
  }

  function assignTask(user, body) {
    if (user.slashSide !== "leading") fail(403, "Only the leading partner hands out tasks.");
    const follower = followingUser();
    if (!follower || follower.id === user.id) fail(400, "Pair up with your partner first.");
    const template = templateById(body.templateId);
    if (!template) fail(400, "Pick a task first.");
    const daily = body.repeat === "daily";
    if (daily && template.id === "daily-adventure") {
      fail(400, "Today’s adventure can’t be set to repeat. Your partner can start one any day they like.");
    }
    if (template.id === "daily-adventure" && openAdventure(follower.id)) {
      fail(409, "There’s already an adventure waiting.");
    }
    const typed = cleanText(body.title, 80);
    if (template.custom && (typed.length < 2 || typed === template.title)) fail(400, "Give the task a name.");
    const title = typed || template.title;
    const note = cleanText(body.note, 400);
    const dueDate = !daily && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || "") ? body.dueDate : "";
    const ownCategory = ["self-care", "fun", "spicy", "grounding"].includes(body.category) ? body.category : "self-care";
    const category = template.custom ? ownCategory : template.category;
    const consent = template.custom ? category === "spicy" : Boolean(template.consent);
    const summary = template.custom ? "" : template.summary;
    let prompt = "";
    if (template.promptPool === "journal") {
      prompt = cleanText(body.prompt, 180) || JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)];
    }
    if (daily) {
      const routine = {
        id: nid(),
        templateId: template.id,
        category,
        title,
        summary,
        note,
        prompt,
        points: template.points,
        bonuses: template.bonuses,
        consent,
        assignedBy: user.id,
        assignedTo: follower.id,
        createdAt: nowIso(),
        stoppedAt: null,
      };
      db.routines.push(routine);
      const first = routineInstance(routine, follower.lastSeenDay || clientDay(body.clientDate));
      db.tasks.push(first);
      user.carePoints = (user.carePoints || 0) + 4;
      return first;
    }
    const created = {
      id: nid(),
      templateId: template.id,
      category,
      title,
      summary,
      note,
      prompt,
      points: template.points,
      bonuses: template.bonuses,
      consent,
      assignedBy: user.id,
      assignedTo: follower.id,
      status: "open",
      dueDate,
      createdAt: nowIso(),
      completedAt: null,
      completionDate: "",
      completion: null,
      acknowledgedAt: null,
      adventure: template.id === "daily-adventure"
        ? { stage: "sealed", day: dueDate || clientDay(body.clientDate), categories: [], locked: [] }
        : null,
    };
    db.tasks.push(created);
    user.carePoints = (user.carePoints || 0) + 4;
    return created;
  }

  function completeTask(user, taskItem, body) {
    if (taskItem.assignedTo !== user.id) fail(403, "That one’s your partner’s to do.");
    if (taskItem.status !== "open") fail(409, "That task’s already closed.");
    const template = templateById(taskItem.templateId);
    if (template?.id === "daily-adventure") fail(400, "Pick your categories first. That’s what locks in the tasks.");
    if ((taskItem.consent ?? template?.consent) && body.consent !== true) {
      fail(400, "Tick the box to say you want to send this, or pass on it.");
    }
    const note = cleanText(body.note, 4000);
    const choice = cleanText(body.choice, 40);
    const checklist = Array.isArray(body.checklist) ? body.checklist.map((item) => cleanText(item, 60)).filter(Boolean).slice(0, 8) : [];
    const bonusIds = new Set(Array.isArray(body.bonuses) ? body.bonuses : []);
    const bonuses = (taskItem.bonuses || []).filter((bonus) => bonusIds.has(bonus.id)).map((bonus) => bonus.id);
    const photos = sanitizePhotos(body.photos);
    if (template?.completion === "checklist" && checklist.length < (template.checklistCount || 1)) {
      fail(400, `Pick ${template.checklistCount} things you actually did.`);
    }
    if (template?.completion === "choices" && !template.choices.includes(choice)) {
      fail(400, "Where’d you do it? Pick one.");
    }
    if ((template?.photoMin || 0) > photos.length) {
      fail(400, `This one needs ${template.photoMin} photo${template.photoMin === 1 ? "" : "s"}.`);
    }
    if (template?.completion === "photos" && photos.length === 0 && note.length < 2) {
      fail(400, "Add a photo or a quick note.");
    }
    if ((template?.completion === "note" || template?.completion === "timer") && note.length < 2) {
      fail(400, "Say a little about how it went.");
    }
    const written = note || (template?.completion === "breath" ? "Paused and grounded." : "");
    const earned =
      (taskItem.points || 0) +
      (taskItem.bonuses || []).filter((bonus) => bonuses.includes(bonus.id)).reduce((sum, bonus) => sum + bonus.points, 0);
    const before = levelFor(user.points || 0);
    user.points = (user.points || 0) + earned;
    const after = levelFor(user.points);
    const streak = applyStreak(user, body.clientDate);
    taskItem.status = "done";
    taskItem.completedAt = nowIso();
    taskItem.completionDate = streak.today;
    if (taskItem.routineId) taskItem.day = streak.today;
    taskItem.completion = {
      note: written,
      bonuses,
      photos,
      checklist,
      choice,
    };
    if (template) bumpGoals({ ...template, category: taskItem.category });
    const celebration = {
      kind: after.name !== before.name ? "level" : streak.milestone ? "streak" : "task",
      title: after.name !== before.name ? after.name : streak.milestone ? `${streak.streak} days in a row` : "Task done",
      detail: after.name !== before.name
        ? `${user.displayName.split(" ")[0]} made it to ${after.name}.`
        : `+${earned} points`,
      points: earned,
    };
    return celebration;
  }

  function skipTask(user, taskItem, body) {
    if (taskItem.assignedTo !== user.id && taskItem.assignedBy !== user.id) fail(403, "Only the two of you can close this.");
    if (taskItem.status !== "open") fail(409, "That task’s already closed.");
    taskItem.status = "skipped";
    taskItem.completedAt = nowIso();
    taskItem.completion = { note: cleanText(body?.reason, 240) || "Passed on this one.", bonuses: [], photos: [], checklist: [], choice: "" };
  }

  function acknowledgeTask(user, taskItem) {
    if (user.slashSide !== "leading") fail(403, "The well done comes from the leading partner.");
    if (taskItem.status !== "done") fail(409, "It isn’t done yet.");
    if (taskItem.acknowledgedAt) return;
    taskItem.acknowledgedAt = nowIso();
    user.carePoints = (user.carePoints || 0) + 6;
    queueCheer(userById(taskItem.assignedTo), { kind: "praise", what: taskItem.title, from: user.id });
  }

  function removeTask(user, taskItem) {
    if (taskItem.routineId) {
      stopRoutine(user, taskItem);
      return;
    }
    if (taskItem.assignedBy !== user.id || user.slashSide !== "leading") fail(403, "Only whoever gave the task can take it back.");
    if (taskItem.status !== "open") fail(409, "Finished tasks stay on the record.");
    db.tasks = db.tasks.filter((item) => item.id !== taskItem.id);
  }

  /** Ends a daily task. Days already done or passed on stay on the record. */
  function stopRoutine(user, taskItem) {
    const routine = db.routines.find((item) => item.id === taskItem.routineId);
    if (!routine) fail(404, "That isn’t a daily task.");
    if (routine.assignedBy !== user.id || user.slashSide !== "leading") fail(403, "Only whoever gave the task can stop it.");
    if (routine.stoppedAt) return;
    routine.stoppedAt = nowIso();
    db.tasks = db.tasks.filter((item) => !(item.routineId === routine.id && item.status === "open"));
  }

  function agreeReward(user, reward) {
    if (reward.status === "granted") fail(409, "That one’s already been granted.");
    if (!reward.agreedBy.includes(user.id)) reward.agreedBy.push(user.id);
    const both = db.pair && db.pair.members.every((id) => reward.agreedBy.includes(id));
    if (both && (reward.status === "proposed" || reward.status === "agreed")) reward.status = "agreed";
  }

  function requestReward(user, reward) {
    if (user.slashSide !== "following") fail(403, "Cashing in is for the following partner.");
    if (reward.status !== "agreed" && reward.status !== "requested") fail(409, "You both need to say yes before it can be cashed in.");
    if ((user.points || 0) < reward.cost) fail(409, "Not enough points yet.");
    reward.status = "requested";
    reward.requestedBy = user.id;
  }

  function grantReward(user, reward) {
    if (user.slashSide !== "leading") fail(403, "Granting is for the leading partner.");
    if (reward.status !== "requested") {
      fail(409, "Your partner has to cash it in first.");
    }
    const follower = followingUser();
    if (!follower) fail(409, "Pair up before granting rewards.");
    if ((follower.points || 0) < reward.cost) fail(409, "Not enough points yet.");
    if (reward.agreedBy.length < 2 && db.pair) fail(409, "You both need to say yes first.");
    follower.points -= reward.cost;
    reward.status = "granted";
    reward.grantedBy = user.id;
    reward.grantedAt = nowIso();
    user.carePoints = (user.carePoints || 0) + 8;
    queueCheer(follower, { kind: "reward", what: reward.title, from: user.id });
    return { kind: "reward", title: reward.title, detail: `${reward.cost} points well spent.`, points: reward.cost };
  }

  function withdrawReward(user, reward) {
    if (reward.proposedBy !== user.id) fail(403, "Only whoever suggested it can take it back.");
    if (reward.status !== "proposed") fail(409, "You’ve both said yes to that one, so it stays.");
    db.rewards = db.rewards.filter((item) => item.id !== reward.id);
  }

  function inviteCode() {
    let code = "";
    const bytes = randomBytes(8);
    for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (db.invites.some((invite) => invite.code === code)) return inviteCode();
    return code;
  }

  function sanitizePhotos(value) {
    if (!Array.isArray(value) || !value.length) return [];
    const photos = [];
    for (const item of value.slice(0, 3)) {
      if (typeof item !== "string") continue;
      if (!item.startsWith("data:image/jpeg") && !item.startsWith("data:image/png")) continue;
      if (item.length > 700_000) fail(400, "That photo’s too big. Try a smaller one.");
      photos.push(item);
    }
    return photos;
  }

  async function handle(req, res) {
    try {
      const body = await readBody(req);
      const header = req.headers.authorization || req.headers.Authorization || "";
      const bearer = String(header).startsWith("Bearer ") ? String(header).slice(7) : "";
      const result = await dispatch({
        method: req.method || "GET",
        url: req.url || "/",
        token: bearer,
        body,
        clientDate: String(req.headers["x-client-date"] || ""),
      });
      sendJson(res, result.status, result.body);
    } catch (error) {
      const status = error.status || 500;
      sendJson(res, status, { error: error.status ? error.message : "Something went wrong." });
    }
  }

  function listen(port = 47322, host = "127.0.0.1") {
    const server = createServer((req, res) => {
      void handle(req, res);
    });
    server.listen(port, host);
    return server;
  }

  return { dispatch, handle, listen, dataFile };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === "GET" || req.method === "HEAD") {
      resolve({});
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 8_000_000) {
        reject(Object.assign(new Error("That upload is too large."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("The request was not valid JSON."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const launchedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launchedDirectly) {
  const port = Number(process.env.SLASHCONNECT_PORT || 47322);
  const app = createSlashApp({ seedDemo: true });
  app.listen(port);
  console.log(`SlashConnect API http://127.0.0.1:${port}`);
}
