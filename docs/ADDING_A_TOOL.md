# Adding a legal tool to inFORMed

inFORMed is built as one shared core with legal tools plugged into it. The protection order is the first tool. This guide explains how to add another one, for example a maintenance application or a harassment protection order, when GRIT decides to.

## What every tool gets from the core

A new tool does not rebuild any of these. It uses them as they are:

- **The safety layer:** GRIT's danger phrases, the fixed emergency replies, the AI's own danger check, the support line, and the reply when the AI cannot answer (`lib/core/safety.js`, `lib/core/engine.js`).
- **Languages:** the conversation in the person's language, and the separate step that keeps official documents in English (`lib/core/language.js`).
- **Voice:** speaking instead of typing, and listening to replies (`lib/core/voice.js`).
- **Channels:** the website and WhatsApp (`api/`, `lib/core/bot.js`).
- **Limits and access code** (`lib/core/guard.js`), **WhatsApp memory** (`lib/core/store.js`) and **usage counters** (`lib/core/counters.js`).
- **Legal source records:** the same record fields, checks and "approved only" rule (`lib/core/knowledge.js`).
- **Hosting:** the same Firebase function in Johannesburg. A new tool needs no new server.

## What a tool is

A tool is one folder in `lib/tools/`. Copy `lib/tools/protection-order/` to start, then change each part:

| File | What it holds | Who approves it |
|---|---|---|
| `index.js` | The tool's id and name, and what the core needs from it. The comment at the top lists every export; keep all of them. | Developer |
| `sources/*.json` | The legal sources, one record per source, with the fields described in the README. Start each one as `draft`. | Legal advisor |
| `knowledge.js` | The tool's system prompt, and the order in which the AI reads its approved sources. | Legal advisor (content), developer |
| `workflow.json` | The steps, questions, fields with their levels, rules, statement rules and legal sources. Status `pending_legal_review` until approved. | Legal advisor |
| `rules.js` | The AI's instructions for this tool and its answer format (which fields it may fill). | Developer, reviewed with the legal advisor |
| `forms/` | The official form, if there is one (the government's own fillable PDF). | Legal advisor confirms the current version |
| `official.js`, `render.js` | Filling the official form, and the Word and text versions. | Developer, checked by the legal advisor |
| `openings.js` and `chat` in `index.js` | The opening messages and fixed WhatsApp wording. | GRIT, then translated |

## Steps

1. **Discovery first.** Map the legal process with the legal advisor before writing anything: who can apply, the official form, what the court needs, exceptions, and what happens after the application.
2. **Create the folder** by copying `lib/tools/protection-order/`, and give the tool a new id (for example `maintenance`) in `index.js`.
3. **Add the legal sources** as records in `sources/`, all `draft` at first. Run `npm run review` to see them on the review page.
4. **Write the workflow** in `workflow.json`: one step per section of the official form, every field with a level, the rules, and the legal sources each step relies on.
5. **Write the AI's instructions** in `rules.js` and `knowledge.js`, and the answer format with this tool's field ids.
6. **Connect the official form** in `forms/`, `official.js` and `render.js`, if the tool produces one.
7. **Register the tool:**
   - add it to `lib/tools/index.js`;
   - add its id to `tool` in `ALLOWED` in `lib/core/counters.js`;
   - add its id to `TOOLS` in `scripts/review.js`, so it gets its own review page.
8. **Website.** The current page is built for the protection order: `public/index.html` sends `TOOL = 'protection-order'`, and the form panel is drawn from `public/fields.js`. A second tool needs either its own page (for example `public/maintenance/index.html` with its own field definition and `TOOL = 'maintenance'`) or a tool chooser on the home page that switches between tools. This is the largest part of adding a tool.
9. **WhatsApp.** WhatsApp conversations remember which tool they use (`tool` in the conversation state). Add a way for people to choose the new tool, for example a word they send or a button on the first message.
10. **Translations.** Add the tool's fixed wording to the translation workbook, and have it translated and checked before the tool is offered in that language.
11. **Checks.** Add automatic checks for the new tool to `test/smoke.js`: its form is generated, every field is in exactly one workflow step, and only approved sources reach the AI. Then run the golden and red-team tests for the tool in each language.
12. **Approval.** The legal advisor approves the sources, workflow and documents; the safeguarding lead confirms the safety wording; GRIT's leadership approves the launch.
13. **Deploy** as usual: `firebase deploy --only functions,hosting --project informed-grit`.

## Things to keep true for every tool

- Only approved legal sources reach the AI, and every answer can be traced to its source.
- Official documents are always completed in English; the conversation follows the person's language.
- No chat logs and no copies of forms are kept. WhatsApp conversations are deleted 24 hours after the last message.
- Missing information never stops someone from generating their document.
- The AI never writes its own reply to someone in danger; GRIT's approved replies are used.
