# HuManuScript

A manuscript editor for writers who want a record of how the prose got onto the page. It is built on the manuscript model from [Speak Fiction](https://github.com/shane-carlson/SpeakFiction) (MIT): chapters, scenes, sections, and paragraphs; bold, italic, and underline marks stored as offsets into the plain text; and drag-to-reorder, where a chapter takes the prose beneath it with it.

HuManuScript adds a certification layer. As you type, paste, drop, or otherwise insert text, each span keeps its origin. Keyboard text is sealed with a SHA-256 hash of the current span, the input events observed for it, and the time. Pasted text, including a paste from an AI chat, stays visibly uncertified. So does a drop from outside the editor, and any other insertion such as a spellcheck replacement or an untrusted scripted edit.

This is evidence from the browser, not proof against someone simulating events. It is not a cryptographic authorship certificate. That limit is stated in the editor and in the certification file you export.

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

The manuscript and its certification record are saved in this browser (`localStorage`). Use **Save manuscript** and **Save certification** to download JSON files. The certification file includes the trust statement, the sealed points, move events, and the origin of every passage.

## What came from Speak Fiction

The public GitHub repository `shane-carlson/SpeakFiction` is the same project as the private Origin mirror (`githubNodeId` `R_kgDOT7fwgg`). Its editor is a React 18, TypeScript, and Vite app inside an Electron shell. HuManuScript keeps that renderer stack (React, TypeScript, Vite) and the manuscript operations that matter for writing: block structure, rich-text marks, and reorder. Dictation, licensing, and the desktop shell are not part of this slice.

## Certification, briefly

| How text entered | What you see | Sealed? |
| --- | --- | --- |
| Keyboard, including an IME composition | Green underline | Yes |
| Paste, including middle-click yank | Amber underline | No |
| Drop from outside the page | Blue underline | No |
| Anything else, including an untrusted `insertText` | Purple underline | No |

Moving a block, or dragging a passage to another place in the manuscript, keeps a keyboard seal on that text. The move is recorded. A paste that lands in the middle of a sealed sentence splits it: the typed remnants stay sealed, and the pasted middle does not.
