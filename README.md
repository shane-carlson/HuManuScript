# HuManuScript

A manuscript editor for writers who want a record of how the prose got onto the page. It is built on the manuscript model from [Speak Fiction](https://github.com/shane-carlson/SpeakFiction) (MIT): chapters, scenes, sections, and paragraphs; bold, italic, and underline marks stored as offsets into the plain text; and drag-to-reorder, where a chapter takes the prose beneath it with it.

HuManuScript adds a certification layer. As you type, dictate, paste, drop, or otherwise insert text, each span keeps its origin. Keyboard text and dictated text are each sealed with a SHA-256 hash of the current span, the input events observed for it, and the time. Dictation is its own origin: sealed, and not counted as keyboard, paste, or other. Pasted text, including a paste from an AI chat, stays visibly uncertified. So does a drop from outside the editor, and any other insertion such as a spellcheck replacement or an untrusted scripted edit.

This is evidence from the browser, not proof against someone simulating events. It is not a cryptographic authorship certificate. That limit is stated on the certification summary that leads every export.

## Run it

```bash
npm install
npm run dev
```

The dev server is [http://127.0.0.1:47321](http://127.0.0.1:47321).

```bash
npm test
npm run build
```

The library (books, optional series, and each book’s manuscript with its own certification seals) is saved in this browser (`localStorage`). HuManuScript works with no account. **Sync** in the header is optional. Sign in with the same email and password as [your Ready Writer One account](https://www.readywriter.one/account), or create one here and confirm the email before signing in. Signing in is only for sync. Sync copies manuscripts, notes, and certification seals to that account. It does not send them to an AI, and it does not recalculate seal hashes. Signing out leaves the account copy in place. **Version history** in the left navigation opens snapshots and backup as tabs. Snapshots save named versions per book (with auto-save checkpoints and a safety copy before restore). **Backup & restore** downloads JSON for selected books (all selected by default) or merges a backup file back in. On the manuscript toolbar, **View → Export preview** shows the one-page certification summary, the page break, and the manuscript without certification highlights. Use the left **Export** workspace to download that same file. Every writer format (Word, RTF, Scrivener, ODT, Markdown, plain text, PDF) uses that same summary and starts the manuscript on the next page. The certification panel still offers a certification JSON download per book.

### Desktop (macOS)

Electron wraps the same Vite build as the web app (Speak Fiction’s desktop pattern, without dictation). **Build the `.dmg` on a Mac only** — electron-builder’s DMG target needs macOS.

```bash
npm install
npm run make:icns   # optional; macOS only — sharper Dock icon
npm run pack:mac    # arm64 DMG (default)
npm run pack:mac:all  # arm64 + Intel DMGs
```

Artifacts land in `release/`. Signing matches Speak Fiction / StoryBind: set `CSC_LINK` + `CSC_KEY_PASSWORD` or `CSC_NAME` (Developer ID in your keychain) before `pack:mac`. For notarization, also set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` (or Apple API key vars). Without those, the script builds an **unsigned** DMG for local testing — use **Open** from the context menu the first time if Gatekeeper blocks it.

#### GitHub Actions (signed DMG)

The **Pack Mac DMG** workflow (`.github/workflows/pack-mac.yml`) runs on `main` pushes and manual dispatch. It **requires** repository secrets:

| Secret | Purpose |
| --- | --- |
| `CSC_LINK` | Base64 of your **Developer ID Application** `.p12` (`base64 -i cert.p12 \| pbcopy`) |
| `CSC_KEY_PASSWORD` | Password for that `.p12` |
| `APPLE_API_KEY` | Contents of the App Store Connect API `.p8` key (recommended) |
| `APPLE_API_KEY_ID` | Key ID (e.g. `ABCD1234`) |
| `APPLE_API_ISSUER` | Issuer UUID from App Store Connect |

**Or** instead of the API key trio: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

The workflow uploads `HuManuScript-*-arm64-signed` from the Actions **Artifacts** tab. Local `pack:mac` still works unsigned when those env vars are unset.

Each signed pack writes `build/app-version.json` from `package.json` `version` plus `HM_BUILD_NUMBER` (the workflow run number). The header shows `0.1.0 (dev)` when that number is absent, and `0.1.0 (<run number>)` in a production pack. electron-builder sets `CFBundleShortVersionString` / `CFBundleVersion` from the same values.

#### Cloud agent: trigger the workflow

Same pattern as Speak Fiction / StoryBind: add a **fine-grained PAT** to your **Cloud Agent environment secrets** as **`GH_TOKEN`** (Actions read/write on this repo). Then:

```bash
npm run dispatch:pack-mac
```

See `.cursor/CLOUD-AGENT.md` for PAT scopes and optional env vars.

```bash
npm run dev:electron   # Vite + Electron against localhost:47321
```

## What came from Speak Fiction

The public GitHub repository `shane-carlson/SpeakFiction` is the same project as the private Origin mirror (`githubNodeId` `R_kgDOT7fwgg`). Its editor is a React 18, TypeScript, and Vite app inside an Electron shell. HuManuScript keeps that renderer stack (React, TypeScript, Vite) and the manuscript operations that matter for writing: block structure, rich-text marks, and reorder. A speech engine and licensing are out of scope; dictated text that the platform already inserts is sealed as its own origin. The Electron shell and `pack:mac` script are included for local Mac installs.

## Certification, briefly

| How text entered | What you see | Sealed? |
| --- | --- | --- |
| Keyboard, including an IME composition | Green underline | Yes, as keyboard |
| Dictation (`insertFromDictation`, or a trusted multi-character insert that is not a paste, drop, or keystroke) | Teal underline | Yes, as dictation |
| Paste, including middle-click yank | Amber underline | No |
| Drop from outside the page | Blue underline | No |
| Anything else, including an untrusted `insertText` or a too-fast keystroke | Purple underline | No |

Moving a block, or dragging a passage to another place in the manuscript, keeps a keyboard seal on that text. The move is recorded. A paste that lands in the middle of a sealed sentence splits it: the typed remnants stay sealed, and the pasted middle does not.
