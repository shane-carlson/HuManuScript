# HuManuScript

A manuscript editor for writers who want a record of how the prose got onto the page. It is built on the manuscript model from [Speak Fiction](https://github.com/shane-carlson/SpeakFiction) (MIT): chapters, scenes, sections, and paragraphs; bold, italic, and underline marks stored as offsets into the plain text; and drag-to-reorder, where a chapter takes the prose beneath it with it.

HuManuScript adds a certification layer. As you type, dictate, paste, drop, or otherwise insert text, each span keeps its origin. Keyboard text and dictated text are each sealed with a SHA-256 hash of the current span, the input events observed for it, and the time. Dictation is its own origin: sealed, and not counted as keyboard, paste, or other. Pasted text, including a paste from an AI chat, stays visibly uncertified. So does a drop from outside the editor, and any other insertion such as an untrusted scripted edit. A spelling suggestion or a Harper grammar fix inside a sealed passage stays sealed. The certification point for that passage notes the check. Spelling uses the platform dictionary or the bundled word list. Harper, when a suggestion is accepted, is a local checker. The manuscript is not sent to a cloud grammar service.

This is evidence from the browser, not proof against someone simulating events. It is not a cryptographic authorship certificate. That limit is stated on the certification summary that leads the Word, RTF, ODT, Markdown, text, and PDF exports. The EPUB ebook does not include it.

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

The library (books, optional series, and each book’s manuscript with its own certification seals) is saved in this browser (`localStorage`). Optional session pictures stay off until you turn them on in the session bar at the top of the manuscript, next to the word goal and timer. That setting, including whether the camera and screen allow lasts for this writing session or is remembered on this device, is `localStorage` key `humanuscript.sessionCapture.v1`. Each capture is one JPEG: a moderate-resolution screenshot with the camera in the upper left. Those composites are blobs in IndexedDB database `humanuscript.sessionCaptures.v1` (object stores `sessions` and `thumbnails`). They are added to the certification JSON only while the setting is on. The Export workspace downloads them as a separate PDF, six pictures per page, not as part of the certification summary that leads a manuscript export. **Version history** in the left navigation opens snapshots and backup as tabs. Snapshots save named versions per book (with auto-save checkpoints and a safety copy before restore). **Backup & restore** downloads JSON for selected books (all selected by default) or merges a backup file back in. On the manuscript toolbar, **View → Export preview** shows the one-page certification summary, the page break, and the manuscript without certification highlights. Use the left **Export** workspace to download that same file. Word, RTF, Scrivener, ODT, Markdown, plain text, and PDF use that same summary and start the manuscript on the next page. EPUB is its own Export tab: a reflowable ebook with the author, language, ISBN or saved id, cover, Kindle-safe text choices, and a local standards check. Publication pages (title, copyright, and the optional dedication, epigraph, also-by, and about-the-author text) are off on every file export until you turn them on. The certification summary is left out of the EPUB. Print-on-demand stays PDF. The certification panel still offers a certification JSON download per book.

### Desktop

Electron wraps the same Vite build as the web app (Speak Fiction’s desktop pattern, without dictation). **Build the `.dmg` on a Mac** and the Windows installer on Windows — the GitHub Actions workflow does both.

#### macOS

```bash
npm install
npm run make:icns   # optional; macOS only — sharper Dock icon
npm run pack:mac    # arm64 DMG (default)
npm run pack:mac:all  # arm64 + Intel DMGs
```

Artifacts land in `release/`. Signing matches Speak Fiction / StoryBind: set `CSC_LINK` + `CSC_KEY_PASSWORD` or `CSC_NAME` (Developer ID in your keychain) before `pack:mac`. For notarization, also set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` (or Apple API key vars). Without those, the script builds an **unsigned** DMG for local testing — use **Open** from the context menu the first time if Gatekeeper blocks it.

#### Windows

```bash
npm install
npm run pack:win    # NSIS installer, x64. Run this on Windows.
```

The installer is `release/HuManuScript-<version>-x64.exe`. Signing uses `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` (a Windows `.pfx`, not the Apple Developer ID). Without those, the script builds an **unsigned** installer and Windows SmartScreen warns on first open. The same `HM_BUILD_NUMBER` as the Mac pack becomes `0.1.<run>` in the installer name and `latest.yml`, which is what the installed app updates from.

#### GitHub Actions (Mac and Windows)

The **Pack Mac and Windows** workflow (`.github/workflows/pack-mac.yml`) runs on `main` pushes and manual dispatch. One run number is the marketing version for both installers, and both are attached to the same GitHub Release. The Mac job **requires** repository secrets:

| Secret | Purpose |
| --- | --- |
| `CSC_LINK` | Base64 of your **Developer ID Application** `.p12` (`base64 -i cert.p12 \| pbcopy`) |
| `CSC_KEY_PASSWORD` | Password for that `.p12` |
| `APPLE_API_KEY` | Contents of the App Store Connect API `.p8` key (recommended) |
| `APPLE_API_KEY_ID` | Key ID (e.g. `ABCD1234`) |
| `APPLE_API_ISSUER` | Issuer UUID from App Store Connect |

**Or** instead of the API key trio: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

The workflow uploads the signed DMG and the Windows installer from the Actions **Artifacts** tab, and publishes both on the release (`latest-mac.yml` and `latest.yml`). Local `pack:mac` still works unsigned when the Apple env vars are unset.

Optional Windows signing secrets, separate from the Apple certificate:

| Secret | Purpose |
| --- | --- |
| `WIN_CSC_LINK` | Base64 of a Windows code-signing `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | Password for that `.pfx` |

If those are unset, the Windows installer is still published, unsigned.

Each pack writes `build/app-version.json` from `package.json` `version` (`0.1.0`) plus `HM_BUILD_NUMBER` (the workflow run number). A numeric run number becomes the marketing version `0.1.<run number>` in the header, the window title, the installer filenames, and `CFBundleShortVersionString` / `CFBundleVersion`. `package.json` stays at `0.1.0`. Local and unsigned packs with no numeric build number stay `0.1.0 (dev)`. An installed copy downloads a newer pack from that release.

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

The public GitHub repository `shane-carlson/SpeakFiction` is the same project as the private Origin mirror (`githubNodeId` `R_kgDOT7fwgg`). Its editor is a React 18, TypeScript, and Vite app inside an Electron shell. HuManuScript keeps that renderer stack (React, TypeScript, Vite) and the manuscript operations that matter for writing: block structure, rich-text marks, and reorder. A speech engine is out of scope; dictated text that the platform already inserts is sealed as its own origin. The Electron shell, `pack:mac`, and `pack:win` scripts build the local installers.

## Polar license

Packaged builds run a **15-day trial** from the first launch, then require a Polar license to keep writing. The library, version history, and export stay available after the trial. One key activates **3 machines**. Unpackaged `npm run dev` and `npm run dev:electron` skip the gate. Force it while developing with `HUMANUSCRIPT_LICENSE_GATE=1`.

HuManuScript uses [Polar](https://polar.sh) as merchant of record. Polar emails the key. The app never ships a Polar organization access token or webhook secret.

Buy opens [the checkout link](https://buy.polar.sh/polar_cl_eIHOifn9kcCTQijdu9kyp7anFWbu9kqVqEIke2EDeo8) in the browser. Paste the key Polar emailed. The desktop app calls Polar’s customer-portal `activate` and `validate` endpoints with the organization id and the key, then remembers a valid key in `license.json` under Electron’s user data directory:

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/HuManuScript/license.json` |
| Windows | `%APPDATA%\HuManuScript\license.json` |
| Linux | `~/.config/HuManuScript/license.json` |

Offline, a licensed copy keeps working for 7 days. Updates do not require a new key. The license file stays in user data when the app binary is replaced.

Public ids live in `electron/polarConfig.cjs` (organization `cfd3c2a6-2654-4565-8c15-e8ca7d25bff6`, product `6488b14c-d63a-4814-b29f-c9ba42ec132f`). Override them when packing with `POLAR_ORGANIZATION_ID`, `POLAR_PRODUCT_ID`, `POLAR_BENEFIT_ID`, `POLAR_CHECKOUT_URL`, or `POLAR_SERVER=sandbox`.

## Certification, briefly

| How text entered | What you see | Sealed? |
| --- | --- | --- |
| Keyboard, including an IME composition | Green underline | Yes, as keyboard |
| Dictation (`insertFromDictation`, or a trusted multi-character insert that is not a paste, drop, or keystroke) | Teal underline | Yes, as dictation |
| Spelling suggestion or Harper grammar fix inside a sealed passage | Same underline as that seal | Yes. The seal stays keyboard or dictation, and the point notes the check |
| Paste, including middle-click yank | Amber underline | No |
| Drop from outside the page | Blue underline | No |
| Anything else, including an untrusted `insertText` or a too-fast keystroke | Purple underline | No |

Moving a block, or dragging a passage to another place in the manuscript, keeps a keyboard seal on that text. The move is recorded. A paste that lands in the middle of a sealed sentence splits it: the typed remnants stay sealed, and the pasted middle does not.
