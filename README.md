# SlashConnect

SlashConnect is a private app for two adults in a long-distance power-exchange dynamic. One household holds exactly two accounts. The leading partner hands out tasks, each one either a one-time task or a daily one such as drinking a set amount of water or taking meds. A daily task comes back every day on the following partner's calendar until the leading partner stops it. Before a task goes out, daily or one-time, the leading partner can change what it is called, what it asks, and how many points it is worth; a daily task keeps that version every day. Water is set as ounces a day: the following partner logs each drink as the day goes, both partners see the running count, and reaching the amount finishes the task. While the app is open it reminds the following partner to drink, and every reminder gives the real count so far. The following partner does them, earns points, and builds a streak. Each person's stuffie guide celebrates with them, in its own way, when a task is done, a level or streak is reached, a reward is granted, or the leading partner says well done. A well done waits for the following partner until their app has shown it. Rewards exist only after both people agree. Today's adventure lets the following partner pick one to three categories for their headspace. The tasks stay hidden until that choice is locked in, and then those tasks stay.

Roles such as Little, Middle, Babygirl, and Babyboy are adult identities. The app asks each person to confirm they are 18 or older.

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

## Put it on testers’ phones with Firebase

Testers get a web address. They open it in Safari or Chrome and, if they like, use “Add to Home Screen” so it opens full screen with its own icon. There is no app store step and nothing to install from a file.

What runs where:

| Piece | Firebase product | In this repo |
| --- | --- | --- |
| The app | Hosting | `dist/`, built by `npm run build` |
| The API under `/api` | One Cloud Function, `api`, in `us-central1` | `functions/`, which bundles `server/hosted.mjs` |
| Everyone’s data | Firestore | Read and written only by the function. `firestore.rules` refuses every request from a browser. |

Hosted, every couple gets a household of their own. There is no demo pair, and no way to wipe anything from the welcome screen. Photos are kept beside the household and only its two people can open them.

Deploy it:

1. Create a project in the [Firebase console](https://console.firebase.google.com) and move it to the Blaze plan. Cloud Functions will not deploy without it.
2. In the console, open Firestore Database and create the database.
3. Copy `functions/.env.example` to `functions/.env` and set `TESTER_CODE` to a word you will give your testers. Leave it empty and anyone with the address can sign up.
4. Sign in and deploy:

```bash
npx firebase-tools@15.35.0 login
npm run firebase:deploy -- --project your-project-id
```

5. Send testers the Hosting address it prints (`https://your-project-id.web.app`) and the tester code. One partner signs up and sends the invite link from the app; whoever opens that link does not need the tester code.

Try the whole thing on this computer first. It needs Java for the Firestore emulator and no Firebase account:

```bash
TESTER_CODE=sunflower npm run firebase:emulate
```

Then open [http://127.0.0.1:5000](http://127.0.0.1:5000).

Know this before real people use it:

- Sign-in is the app’s own email and password. There is no “forgot my password” and no email check, so a tester who forgets theirs needs a new account.
- A household is one Firestore document, capped at about 1 MB. Photos are stored separately, and a task takes roughly 700 bytes, so a couple has room for about 1,300 tasks. At four a day that is under a year. Past that, saving stops with a message. Fine for a test, not for the long run.
- Photos and notes live in your Firebase project. Anyone with access to that project can read them.
- Water reminders only show while the app is open. Nothing is pushed to a locked phone.
- A wrong password eight times locks that email for 15 minutes. There is no other rate limit.
- Firebase App Distribution is a different thing: it hands out real Android and iOS builds, which this project does not produce yet.

## Desktop shell

Electron still wraps the Vite app:

```bash
npm run dev:electron
```

Installer packaging scripts remain the existing Mac and Windows pack flow.
