# SlashConnect

SlashConnect is a private app for two adults in a long-distance power-exchange dynamic. One household holds exactly two accounts. It runs as a website, as iOS and Android apps, and on a desktop.

Roles such as Little, Middle, Babygirl, and Babyboy are adult identities. The app asks each person to confirm they are 18 or older.

## What’s in it

- **Tasks.** The leading partner hands out tasks, each one either a one-time task or a daily one such as drinking a set amount of water or taking meds. A daily task comes back every day on the following partner’s calendar until the leading partner stops it. Before a task goes out the leading partner can change what it is called, what it asks, and how many points it is worth. Water is set as ounces a day: the following partner logs each drink, both see the running count, and reaching the amount finishes the task. Today’s adventure lets the following partner pick one to three categories for their headspace; the tasks stay hidden until that choice is locked in.
- **Well done.** The leading partner says well done for a finished task. It waits for the following partner until their app has shown it. Rewards exist only after both people agree.
- **Things to do.** The leading partner’s Home opens with a card of buttons, most urgent first: say well done, grant a reward that was cashed in, agree on a reward, read or write this week’s check-in, give a task.
- **You, drawn.** Each person builds a little character that looks like them, or like who they are in the dynamic: skin or fur, hair, face, ears, extras and colours, or “Surprise me”.
- **Stuffies.** Everyone keeps a stuffie guide: one of four ready-made ones, or one they roll themselves, name, and give a temperament. It celebrates in its own way when a task is done, a level or streak is reached, a trophy lands, or a well done arrives.
- **A stuffie that knows your history.** On Home and on its own page the stuffie speaks from what has actually happened between the two of you: the task just finished, the streak, this week’s list, what is due, the reward within reach, the well done that arrived or is still owed. Each side of the slash gets its own questions to ask it. It only ever talks about its own household.
- **Levels, days and weeks.** Progress is counted in embers: every point earned, plus small bonuses for a full day, a kept week (four active days) and streak marks from 3 days to a year. Twelve levels of five steps run from Spark to Everflame, so the top is many months away, and spending points on rewards never costs a level. One day off a week never breaks a streak. Home shows today’s ring, the level and step, both streaks and the last seven days; the Progress page shows twelve weeks.
- **Trophy shelf.** A shared shelf of stitched patches for the big moments, with who earned each one and when. Both partners see the same shelf.
- **Weekly check-in.** Once a week each partner writes how they feel about themselves, how they feel about the two of them, what they need and want, and what they would like in the week ahead (more fun, more spice, more structure, more softness, and so on). Weeks start on Monday. Each check-in stays sealed until both are in, then they open side by side, and the leading partner gets a button for each thing that was asked for.
- **Free and Plus.** The app knows two plans, kept per couple. See [Free and Plus](#free-and-plus).

## Run it

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:47321](http://127.0.0.1:47321). The page is laid out like a phone, including inside Electron.

```bash
npm run dev:electron
npm test
```

The API lives on the same dev server under `/api`. Household data is stored in `data/slashconnect.json` (gitignored).

## Try both sides

The first launch seeds a demo pair:

| Person | Side | Email | Password |
| --- | --- | --- | --- |
| Rowan Hale | Leading · Domme · she/her | `rowan@demo.slashconnect` | `together` |
| Avery Quinn | Following · Little · they/them | `avery@demo.slashconnect` | `together` |

The welcome screen can enter either profile after the 18+ confirmation. Profile can switch between them. “Start your own dynamic” clears the demo household so two people can sign up.

## Invite

The unpaired person creates a code, copies the link, or opens a draft email or text. Delivery uses the device’s mail and messages apps. The app does not send mail or SMS itself. Run locally, the household file stays on this computer.

## Firebase

The hosted app (the website and the phone apps) uses the Firebase project `slashconnect-bb3a8`.

| Piece | Firebase product | In this repo |
| --- | --- | --- |
| Signing in | Authentication, email and password | `src/slash/firebase.ts`, checked on every request in `functions/index.js` |
| The app | Hosting | `dist/`, built by `npm run build` |
| The API under `/api` | One Cloud Function, `api`, in `us-central1` | `functions/`, which bundles `server/hosted.mjs` |
| Everyone’s data | Firestore | Read and written only by the function. `firestore.rules` refuses every request from a phone or browser. |

People sign up, sign in, sign out and reset a forgotten password with Firebase Authentication. The server checks the Firebase sign-in on every request and only then opens that couple’s household; it stores no passwords. Every couple gets a household of their own. There is no demo pair. Photos are kept beside the household and only its two people can open them.

Connect and publish it, in this order:

1. In the [Firebase console](https://console.firebase.google.com/project/slashconnect-bb3a8), make sure the project is on the Blaze plan (Cloud Functions will not deploy without it) and that a Firestore database exists.
2. Sign in on the command line: `npx firebase-tools@15.35.0 login`.
3. Register the apps: `npm run firebase:register`. It registers a web app, an Android app and an iOS app (`com.slashconnect.app`) in the project if they are not there yet, and fills in `src/slash/firebase.config.json`. Commit that file. It is safe to run twice; `npm run firebase:register -- --dry-run` shows what it would do.
4. Copy `functions/.env.example` to `functions/.env` and set `TESTER_CODE` to a word you will give your testers. Leave it empty and anyone with the address can sign up.
5. Publish: `npm run firebase:deploy`. This also switches on email and password sign-in. If it does not, switch it on by hand in the console under Authentication, Sign-in method.
6. Rebuild the phone apps so they carry the config: `npm run native:sync`.

Until step 3 is done a hosted build has no Firebase keys, and its welcome screen says it is not connected yet.

Try the whole thing on this computer first. It needs Java for the emulators and no Firebase account:

```bash
TESTER_CODE=sunflower npm run firebase:emulate
```

Then open [http://127.0.0.1:5000](http://127.0.0.1:5000). Sign-in runs against a local Authentication emulator on port 9099.

Know this before real people use it:

- Anyone can sign up with any email address; the app does not wait for the address to be confirmed.
- After a password reset, a phone that was already signed in keeps working for up to an hour.
- A household is one Firestore document, capped at about 1 MB. Photos are stored separately, and a task takes roughly 700 bytes, so a couple has room for about a year of daily use. Past that, saving stops with a message. Fine for a test, not for the long run.
- Photos, notes and weekly check-ins live in your Firebase project. Anyone with access to that project can read them.
- A year of weekly check-ins is kept. Older weeks are dropped to keep the household record small.

## iOS and Android apps

The same app is wrapped as native apps with Capacitor, in `ios/` and `android/` (app id `com.slashconnect.app`). The pages ship inside the app and talk to the hosted server named in `.env.native`.

```bash
npm run native:sync      # build the pages and copy them into both projects
npm run native:android   # then build a debug APK (android/app/build/outputs/apk/debug)
npm run native:ios       # then open the Xcode project (needs a Mac)
```

In the phone apps the Android back button steps back through the app, and water reminders are handed to the phone itself, so they arrive with the app closed. Each one carries the count as it stood when it was planned; they are replanned whenever the app opens or a drink is logged.

Release builds are signed with your own developer accounts in Android Studio and Xcode. Either store, or Firebase App Distribution, can hand them to testers.

## Free and Plus

The app knows two plans, **Free** and **Plus**. A plan belongs to the couple, so one Plus covers both partners. There is no billing yet: while the app is in testing every household has everything, and the Plans page (More, Free and Plus) shows where the line will sit so testers can react to it.

| | Free | Plus |
| --- | --- | --- |
| Safety, consent and care; pairing; giving and doing tasks; well dones; points, levels and streaks; water; today’s adventure; the whole catalog, spicy included; the weekly check-in; the trophy shelf; the avatar builder and the four stuffies | Yes | Yes |
| A stuffie of your own | Roll as long as you like | Keep one |
| Daily tasks running at once | 3 | No limit |
| Write-your-own tasks | 3 a week | No limit |
| Rewards on the table at once | 3 | No limit |
| Looking back: earlier check-ins, the Progress calendar, photos on finished tasks | The last 4 weeks | All of it |
| Heart-to-hearts with the stuffie (“Tell me something about us”, “What should I assign?”) | No | Yes |

The table lives in one place, `server/plans.mjs`, and the server is what refuses: a refused action answers 402 with `code: "plus"`, and the app shows a small card with a link to Plans. Nothing is deleted on Free. Things a couple already made keep running, and they just cannot add past the limit. The one exception is looking back: check-ins and task photos older than four weeks are hidden on Free and come back with Plus.

- On this computer, either partner can flip the household between Plus and Free at the bottom of the Plans page (More, Free and Plus) to feel the difference.
- Hosted, there is no switch. Set `SLASH_EARLY_ACCESS=0` on the server to end early access; from then on a household is on Free until something sets its plan to Plus. That something should be a store purchase checked by the server, which is not built.

## Desktop shell

Electron still wraps the Vite app:

```bash
npm run dev:electron
```

Installer packaging scripts remain the existing Mac and Windows pack flow.
