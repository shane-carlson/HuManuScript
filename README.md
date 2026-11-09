# SlashConnect

SlashConnect is a private app for two adults in a long-distance power-exchange dynamic. One household holds exactly two accounts. The leading partner hands out tasks, each one either a one-time task or a daily one such as drinking a set amount of water or taking meds. A daily task comes back every day on the following partner's calendar until the leading partner stops it. Water is set as ounces a day: the following partner logs each drink as the day goes, both partners see the running count, and reaching the amount finishes the task. While the app is open it reminds the following partner to drink, and every reminder gives the real count so far. The following partner does them, earns points, and builds a streak. Each person's stuffie guide celebrates with them, in its own way, when a task is done, a level or streak is reached, a reward is granted, or the leading partner says well done. A well done waits for the following partner until their app has shown it. Rewards exist only after both people agree. Today's adventure lets the following partner pick one to three categories for their headspace. The tasks stay hidden until that choice is locked in, and then those tasks stay.

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

The unpaired person creates a code, copies the link, or opens a draft email or text. Delivery uses the device’s mail and messages apps. This build does not send mail or SMS itself, and the household file stays on this computer.

## Desktop shell

Electron still wraps the Vite app:

```bash
npm run dev:electron
```

Installer packaging scripts remain the existing Mac and Windows pack flow.
