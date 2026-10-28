# HuManuScript

A manuscript editor for writers who want a record of how the prose got onto the page. It is built on the manuscript model from [Speak Fiction](https://github.com/shane-carlson/SpeakFiction) (MIT): chapters, scenes, sections, and paragraphs; bold, italic, and underline marks stored as offsets into the plain text; and drag-to-reorder, where a chapter takes the prose beneath it with it.

HuManuScript adds a certification layer. As you type, dictate, paste, drop, or otherwise insert text, each span keeps its origin. Keyboard text and dictated text are each sealed with a SHA-256 hash of the current span, the input events observed for it, and the time. A new seal also names the input that produced the span when the operating system can: the keyboard for typed text, the microphone for dictated text. Typed text also records how fast the keys were entered. Unknown input or an unknown rate is said in plain words, and the text is still sealed. Those facts sit next to the computer name on the certification pane and in the detailed certification report. They are not part of the SHA-256 hash, so a seal that already exists keeps its hash and its earlier hashes. Dictation is its own origin: sealed, and not counted as keyboard, paste, or other. Pasted text, including a paste from an AI chat, stays visibly uncertified. So does a drop from outside the editor, and any other insertion such as an untrusted scripted edit. A spelling suggestion or a Harper grammar fix inside a sealed passage stays sealed. The certification point for that passage notes the check. Spelling uses the platform dictionary or the bundled word list. Harper, when a suggestion is accepted, is a local checker. The manuscript is not sent to a cloud grammar service.

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

A download can also register with the **Certified Manuscript Registry**, a Sidequests page on readywriter.one. The app freezes the export, hashes those exact bytes and a plain-text walk of the manuscript, and sends the certification summary plus both checksums. The file is not uploaded. The returned `HMS-` code is kept next to the book. It is not written into the file, because writing it in after the hash would change the bytes. The same bytes are what get downloaded. If the registry cannot be reached, the download still succeeds. The export says the file was not registered, then the HTTP status and the registry's reply, or that the request to the registration URL got no response.

Word, RTF, Scrivener, ODT, Markdown, plain text, and the letter-size PDF put the check instructions at the top of the certification summary: the public registry page, the author’s name, the copyright year when one was entered, the export time, and the canonical text SHA-256. The code, the registry’s received time, and the file SHA-256 are shown on the export screen after the registry accepts the file. EPUB and Format for Print do not include that block.

The public check page is `https://www.readywriter.one/sidequests/certified-manuscript-registry`. The code link is that page plus `/c/{code}`. Registration is `POST https://www.readywriter.one/api/registrations`, and removal is `DELETE` that path plus the code. The apex host redirects to www without a CORS header, and the page path itself does not accept the registration POST, so the app calls the www API directly. Set `VITE_REGISTRY_BASE_URL` to another registry page (no trailing slash). A different host uses `POST` and `DELETE` at `{base}/registrations`. The live readywriter.one page keeps the www API.

On the export screen, the working title can be cleared before it is sent. A cleared title is sent as an empty string so the registry still receives the required field. Computer and device names stay off unless you turn them on. A checkbox generates the detailed certification report from the manuscript already open in the app and sends it as plain text. You do not attach a file. Leave it unchecked to register the summary and the two checksums only. The manuscript text is not uploaded either way.

The library (books, optional series, and each book’s manuscript with its own certification seals) is saved in this browser (`localStorage`). Optional session pictures stay off until you turn camera or screen on in the session bar at the top of the manuscript. Start and End on that bar begin and finish the picture session. That setting, including whether the camera and screen allow lasts for this writing session or is remembered on this device, is `localStorage` key `humanuscript.sessionCapture.v1`. Each capture is one JPEG: a moderate-resolution screenshot with the camera in the upper left. Those composites are blobs in IndexedDB database `humanuscript.sessionCaptures.v1` (object stores `sessions` and `thumbnails`). They are added to the certification JSON only while the setting is on. The certification pane, at the top, downloads them as one PDF. Choose a detailed certification report (a one-page certification summary, then every picture in time order with the full certification record for each window), a high-level summary (pictures and seal summaries only), or seal summaries with no pictures. That download is separate from the certification summary that leads a manuscript export. **Version history** in the left navigation opens snapshots and backup as tabs. Snapshots save named versions per book (with auto-save checkpoints and a safety copy before restore). **Backup & restore** downloads JSON for selected books (all selected by default) or merges a backup file back in. On the manuscript toolbar, **View → Export preview** shows the one-page certification summary, the page break, and the manuscript without certification highlights. Use the left **Export** workspace to download that same file. Word, RTF, Scrivener, ODT, Markdown, plain text, and PDF use that same summary and start the manuscript on the next page. EPUB is its own Export tab: a reflowable ebook with the author, language, ISBN or saved id, cover, Kindle-safe text choices, and a local standards check. Publication pages (title, copyright, and the optional dedication, epigraph, also-by, and about-the-author text) are off on every file export until you turn them on. The certification summary is left out of the EPUB. Print-on-demand stays PDF. The certification panel still offers a certification JSON download per book.

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

Each pack writes `build/app-version.json` from `package.json` `version` (`0.1.0`) plus `HM_BUILD_NUMBER` (the workflow run number). A numeric run number becomes the marketing version `0.1.<run number>` in the header, the window title, the installer filenames, and `CFBundleShortVersionString` / `CFBundleVersion`. `package.json` stays at `0.1.0`. Local and unsigned packs with no numeric build number stay `0.1.0 (dev)`. An installed copy checks that release when the app opens and about once an hour (`latest-mac.yml` on macOS, `latest.yml` on Windows). When a newer version is published, a prompt under the header asks you to update. After you confirm, it downloads that pack and shows progress. When the download finishes, it asks you to restart, and it does not restart until you confirm. A failed download stays on that line so you can keep writing and try again.

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
