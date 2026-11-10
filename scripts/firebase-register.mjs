#!/usr/bin/env node
/**
 * Registers SlashConnect's apps in its Firebase project and writes the web
 * app's config where the app reads it. Safe to run again: anything already
 * registered is found and left as it is.
 *
 *   npm run firebase:register                 (after `npx firebase-tools login`)
 *   npm run firebase:register -- --dry-run    (say what is missing, create nothing)
 *   npm run firebase:register -- --check      (no network: fail if the web config is still empty)
 *   npm run firebase:register -- --android-config
 *       (also save android/app/google-services.json; only App Distribution or a
 *        native Firebase SDK needs it, since sign-in runs inside the web view)
 *
 * Three apps, because Firebase lists them by platform:
 *   Web      the Firebase JS SDK inside the site and inside both phone apps signs in as this one
 *   Android  com.slashconnect.app
 *   iOS      com.slashconnect.app
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_VERSION = "15.35.0";
const NAME = "SlashConnect";
const APP_ID = "com.slashconnect.app";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : "");
const dryRun = flag("--dry-run");
const project = option("--project") || defaultProject();
const configFile = path.resolve(root, option("--out") || "src/slash/firebase.config.json");
const androidFile = path.resolve(root, "android/app/google-services.json");

function defaultProject() {
  try {
    return JSON.parse(readFileSync(path.join(root, ".firebaserc"), "utf8")).projects.default || "";
  } catch {
    return "";
  }
}

function stop(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** Runs one Firebase CLI command and returns what it reports. FIREBASE_CLI swaps in another CLI, for tests. */
function firebase(...command) {
  const custom = process.env.FIREBASE_CLI;
  const [bin, ...lead] = custom ? custom.split(" ") : ["npx", "--yes", `firebase-tools@${CLI_VERSION}`];
  const ran = spawnSync(bin, [...lead, ...command, "--project", project, "--json", "--non-interactive"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (ran.error) stop(`Couldn’t run the Firebase CLI: ${ran.error.message}`);
  let answer = null;
  try {
    answer = JSON.parse(ran.stdout.slice(ran.stdout.indexOf("{")));
  } catch {
    stop(`The Firebase CLI gave an answer this script can’t read for \`${command.join(" ")}\`:\n${ran.stdout}`);
  }
  if (answer.status !== "success") {
    const why = String(answer.error || "no reason given");
    if (/authenticate|firebase login/i.test(why)) {
      stop(`You’re not signed in to Firebase on this computer.\nRun:  npx --yes firebase-tools@${CLI_VERSION} login\nthen run this again.`);
    }
    stop(`Firebase said no to \`${command.join(" ")}\` in ${project}:\n  ${why}`);
  }
  return answer.result;
}

if (flag("--check")) {
  let kept = {};
  try {
    kept = JSON.parse(readFileSync(configFile, "utf8"));
  } catch {
    /* Missing or unreadable counts as empty. */
  }
  if (!kept.apiKey || !kept.appId) {
    stop(`${path.relative(root, configFile)} has no apiKey or appId yet, so a site built now could not sign anyone in.\nRun:  npm run firebase:register`);
  }
  console.log(`Web config is filled in for ${kept.projectId}.`);
  process.exit(0);
}

if (!project) stop("No Firebase project named. Pass --project <id>, or set a default in .firebaserc.");
console.log(`Firebase project: ${project}${dryRun ? "  (dry run: nothing will be created or written)" : ""}`);

const apps = firebase("apps:list") || [];
const wanted = [
  {
    platform: "WEB",
    label: "Web",
    name: NAME,
    match: (app) => app.displayName === NAME,
    create: ["apps:create", "WEB", NAME],
  },
  {
    platform: "ANDROID",
    label: "Android",
    name: `${NAME} Android`,
    match: (app) => app.packageName === APP_ID,
    create: ["apps:create", "ANDROID", `${NAME} Android`, "--package-name", APP_ID],
  },
  {
    platform: "IOS",
    label: "iOS",
    name: `${NAME} iOS`,
    match: (app) => app.bundleId === APP_ID,
    create: ["apps:create", "IOS", `${NAME} iOS`, "--bundle-id", APP_ID],
  },
];

const ids = {};
for (const want of wanted) {
  const found = apps.find((app) => app.platform === want.platform && want.match(app));
  if (found) {
    ids[want.platform] = found.appId;
    console.log(`  ${want.label.padEnd(8)}already registered   ${found.appId}`);
    continue;
  }
  if (dryRun) {
    console.log(`  ${want.label.padEnd(8)}not registered yet   (would create “${want.name}”)`);
    continue;
  }
  const made = firebase(...want.create);
  if (!made?.appId) stop(`Firebase created the ${want.label} app but did not say what its id is. Run this again to pick it up.`);
  ids[want.platform] = made.appId;
  console.log(`  ${want.label.padEnd(8)}registered           ${made.appId}`);
}

if (dryRun) {
  console.log("\nDry run finished. Run without --dry-run to register what is missing and write the config.");
  process.exit(0);
}

const sdk = firebase("apps:sdkconfig", "WEB", ids.WEB)?.sdkConfig;
if (!sdk?.apiKey || !sdk?.appId) stop("Firebase returned a web config with no apiKey or appId. Nothing was written.");
// The order the file is kept in, so running this twice leaves no difference behind.
const config = {
  projectId: sdk.projectId || project,
  appId: sdk.appId,
  storageBucket: sdk.storageBucket || "",
  apiKey: sdk.apiKey,
  authDomain: sdk.authDomain || `${project}.firebaseapp.com`,
  messagingSenderId: sdk.messagingSenderId || "",
};
const text = `${JSON.stringify(config, null, 2)}\n`;
const before = existsSync(configFile) ? readFileSync(configFile, "utf8") : "";
if (before === text) {
  console.log(`\nWeb config already up to date: ${path.relative(root, configFile)}`);
} else {
  writeFileSync(configFile, text);
  console.log(`\nWrote the web config to ${path.relative(root, configFile)}`);
}

if (flag("--android-config")) {
  const file = firebase("apps:sdkconfig", "ANDROID", ids.ANDROID);
  if (!file?.fileContents) stop("Firebase returned no google-services.json for the Android app.");
  writeFileSync(androidFile, file.fileContents.endsWith("\n") ? file.fileContents : `${file.fileContents}\n`);
  console.log(`Wrote ${path.relative(root, androidFile)}`);
}

console.log(`
Next:
  1. npm run firebase:deploy     turns on Email/password sign-in (the "auth" block in firebase.json)
                                 and puts the site, the function and the database rules up
  2. npm run native:sync         rebuilds the pages inside the iOS and Android apps with this config
The web config is not a secret: it only says which Firebase project to talk to. Commit it.`);
