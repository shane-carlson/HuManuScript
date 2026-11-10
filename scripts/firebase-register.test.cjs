const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const script = path.join(__dirname, 'firebase-register.mjs');

/**
 * A stand-in for the Firebase CLI that answers the way firebase-tools 15 does
 * with --json, and keeps the apps it "registers" in a file between runs.
 */
const FAKE_CLI = `
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const state = process.env.FAKE_STATE;
const args = process.argv.slice(2);
const say = (result) => console.log(JSON.stringify({ status: "success", result }, null, 2));
const refuse = (error) => { console.log(JSON.stringify({ status: "error", error })); process.exit(1); };
if (!args.includes("--json") || !args.includes("--non-interactive")) refuse("expected --json --non-interactive");
if (process.env.FAKE_SIGNED_OUT) refuse("Failed to authenticate, have you run firebase login?");
const project = args[args.indexOf("--project") + 1];
const db = existsSync(state) ? JSON.parse(readFileSync(state, "utf8")) : { apps: [], calls: [] };
db.calls.push(args[0]);
const keep = () => writeFileSync(state, JSON.stringify(db));
if (args[0] === "apps:list") { keep(); say(db.apps); }
else if (args[0] === "apps:create") {
  const platform = args[1];
  const kind = platform === "WEB" ? "web" : platform === "IOS" ? "ios" : "android";
  const app = { appId: "1:1234:" + kind + ":" + (db.apps.length + 1) + "abc", displayName: args[2], projectId: project, platform };
  if (platform === "ANDROID") app.packageName = args[args.indexOf("--package-name") + 1];
  if (platform === "IOS") app.bundleId = args[args.indexOf("--bundle-id") + 1];
  db.apps.push(app); keep(); say(app);
}
else if (args[0] === "apps:sdkconfig" && args[1] === "WEB") {
  keep();
  const sdkConfig = { projectId: project, appId: args[2], storageBucket: project + ".firebasestorage.app", apiKey: "AIzaFakeKey", authDomain: project + ".firebaseapp.com", messagingSenderId: "1234", projectNumber: "1234", version: "2" };
  say({ fileName: "firebase-js-config.json", fileContents: JSON.stringify(sdkConfig), sdkConfig });
}
else refuse("unexpected command " + args.join(" "));
`;

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slash-register-'));
  const cli = path.join(dir, 'fake-firebase.mjs');
  const out = path.join(dir, 'firebase.config.json');
  const state = path.join(dir, 'state.json');
  fs.writeFileSync(cli, FAKE_CLI);
  const run = (args = [], env = {}) =>
    spawnSync(process.execPath, [script, '--project', 'demo-project', '--out', out, ...args], {
      encoding: 'utf8',
      env: { ...process.env, FIREBASE_CLI: `${process.execPath} ${cli}`, FAKE_STATE: state, ...env },
    });
  const apps = () => JSON.parse(fs.readFileSync(state, 'utf8')).apps;
  const calls = () => JSON.parse(fs.readFileSync(state, 'utf8')).calls;
  return { out, state, run, apps, calls };
}

test('registering makes the three apps once and writes the web config', () => {
  const box = sandbox();
  const first = box.run();
  assert.equal(first.status, 0, first.stderr + first.stdout);
  assert.deepEqual(
    box.apps().map((app) => [app.platform, app.displayName, app.packageName || app.bundleId || '']),
    [
      ['WEB', 'SlashConnect', ''],
      ['ANDROID', 'SlashConnect Android', 'com.slashconnect.app'],
      ['IOS', 'SlashConnect iOS', 'com.slashconnect.app'],
    ],
  );
  const written = fs.readFileSync(box.out, 'utf8');
  assert.deepEqual(JSON.parse(written), {
    projectId: 'demo-project',
    appId: box.apps()[0].appId,
    storageBucket: 'demo-project.firebasestorage.app',
    apiKey: 'AIzaFakeKey',
    authDomain: 'demo-project.firebaseapp.com',
    messagingSenderId: '1234',
  });

  const second = box.run();
  assert.equal(second.status, 0, second.stderr + second.stdout);
  assert.equal(box.apps().length, 3, 'a second run registers nothing new');
  assert.equal(box.calls().filter((name) => name === 'apps:create').length, 3);
  assert.equal(fs.readFileSync(box.out, 'utf8'), written);
  assert.match(second.stdout, /already registered/);
  assert.match(second.stdout, /already up to date/);

  assert.equal(box.run(['--check']).status, 0);
});

test('a dry run and a signed-out run change nothing', () => {
  const box = sandbox();
  const dry = box.run(['--dry-run']);
  assert.equal(dry.status, 0, dry.stderr + dry.stdout);
  assert.match(dry.stdout, /not registered yet/);
  assert.equal(box.apps().length, 0);
  assert.equal(fs.existsSync(box.out), false);

  const signedOut = box.run([], { FAKE_SIGNED_OUT: '1' });
  assert.equal(signedOut.status, 1);
  assert.match(signedOut.stderr, /not signed in to Firebase/);
  assert.equal(fs.existsSync(box.out), false);

  const check = box.run(['--check']);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /npm run firebase:register/);
});

test('an app that is already there is matched by what it is, not by its name', () => {
  const box = sandbox();
  fs.writeFileSync(box.state, JSON.stringify({
    calls: [],
    apps: [
      { appId: '1:1234:android:old', displayName: 'Renamed by hand', platform: 'ANDROID', packageName: 'com.slashconnect.app' },
      { appId: '1:1234:android:other', displayName: 'SlashConnect Android', platform: 'ANDROID', packageName: 'com.example.other' },
    ],
  }));
  const ran = box.run();
  assert.equal(ran.status, 0, ran.stderr + ran.stdout);
  assert.deepEqual(box.apps().map((app) => app.platform).sort(), ['ANDROID', 'ANDROID', 'IOS', 'WEB']);
  assert.match(ran.stdout, /Android\s+already registered\s+1:1234:android:old/);
});
