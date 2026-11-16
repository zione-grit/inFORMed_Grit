# inFORMed

Trauma-informed legal support assistant. Powered by GRIT (Gender Rights in Tech).

inFORMed is built as **one shared core with tools plugged into it**. The first tool is the protection order application (Form 6 and 6A). More tools can be added without touching the safety layer, languages, voice or channels, which every tool shares.

Two ways to use each tool:

- **Ask a question** (default): explains protection orders, the court process and legal words. Answers come from GRIT's documents first. If they don't cover a question, the AI answers from general knowledge and the reply is clearly labelled "General information, not from GRIT's guides".
- **Fill in my form**: the original inFORMed flow, with the original opening, one gentle question at a time, and the Generate Protection Order button.

People can type or speak: a microphone on the website, and voice notes on WhatsApp. Replies can be read aloud with **Listen**, or every time if the person turns on **Read aloud**. Nothing plays by itself unless they choose that, so nobody nearby hears unexpectedly.

Channels: the **website** and **WhatsApp**. On WhatsApp, `FORM` shows the application as text and `PDF` or `WORD` sends it as a file.

## How the code is organised

```
server.js                  runs inFORMed as one web server on Google Cloud Run (or any computer with Node)
Dockerfile                 how Google Cloud builds it
api/                       the endpoints; the same files run on Google Cloud Run and on Vercel
  chat.js                  website chat (one turn)
  document.js              builds the PDF or Word document
  whatsapp.js              WhatsApp webhook
  transcribe.js            voice to text (website microphone)
  speak.js                 reads a reply aloud (Listen button)
  translate.js             translates the form for "Hear my form" in isiZulu or Afrikaans (listening only)
lib/core/                  shared by every tool
  engine.js                one turn: safety check, model call, "always English" step, support line
  llm.js                   the AI model call (change the model here or with MODEL)
  safety.js                GRIT's trigger phrases, fixed emergency replies, support line, fallback reply
  language.js              reply languages, the "always English" step, "Hear my form" translation
  voice.js                 speech to text, and reading aloud with a word-for-word check
  bot.js                   the WhatsApp conversation (commands, tick lists as numbers, documents)
  guard.js                 message limits and the optional access code
  store.js                 WhatsApp conversation state (Upstash Redis, deleted after 24 hours)
  background.js            finishing WhatsApp work after the webhook is answered
lib/tools/
  index.js                 the list of tools
  protection-order/        the first tool
    index.js               what the core needs from the tool (see the comment at the top)
    rules.js               the AI's instructions and answer schema for this tool
    knowledge.js           system prompt (v8.14) and the six reference documents
    render.js              PDF, Word and text versions of the form
    official.js            fills the government's own PDF form
    forms/J480E-2025-03.pdf  the Department of Justice's Form 6 and 6A
    openings.js            WhatsApp opening messages
    logo.js                logo inside the PDF and Word drafts
public/                    the website
  index.html               home page, chat, form panel, demo, sources
  fields.js                the protection order form definition, shared by the website and the server
  i18n.js                  all page text in English, isiZulu and Afrikaans
  docs.json                the reference documents, for the sources view
```

### Adding a tool

1. Copy `lib/tools/protection-order` to a new folder, for example `lib/tools/maintenance`.
2. Change its form fields, instructions (`rules.js`), knowledge, documents and wording. Keep the same exports as `protection-order/index.js`.
3. Add it to `lib/tools/index.js`.
4. Give the website page for it `TOOL = 'maintenance'` (the page sends this with every request).

The safety layer, languages, voice, limits and WhatsApp handling then work for it automatically. The website page is still built around the protection order, so a second tool also needs its own page or a tool chooser on the home page.

## Models

OpenAI switches off the models inFORMed first used (gpt-4o-mini-tts on 6 January 2027, gpt-4.1 on 14 January 2027, gpt-4o-transcribe on 26 February 2027). inFORMed now uses:

- **Chat, form filling and translation:** `gpt-6.1-terra`, with reasoning effort `low`. Newer models do not take a temperature setting, so it is only sent to gpt-4 models. OpenAI's own suggested replacement is `gpt-6-luna`, which is cheaper; switch with `MODEL=gpt-6-luna` once it has passed the golden and red-team tests.
- **Speech to text:** `gpt-transcribe`. It rejects language codes it does not support, so it only gets the written hint about South African languages.
- **Reading aloud:** `gpt-realtime-2.1-mini`, OpenAI's named replacement. It does not accept the old speech request, so `lib/core/voice.js` opens a realtime connection from the server (the key never reaches the browser), asks for audio only, and turns the audio into a small MP3 (48 kbps) so listening uses little mobile data. Because it is a conversational model, it is told it is only a reader, and what it actually said (its transcript) is compared with the text: if it left out or added words, the audio is not used and it tries once more. If the realtime voice fails, it falls back to gpt-4o-mini-tts while OpenAI still offers it.

Settings: `MODEL`, `REASONING_EFFORT`, `TRANSCRIBE_MODEL`, `TTS_MODEL`, `TTS_VOICE` (default `marin`), `TTS_FALLBACK` (default `gpt-4o-mini-tts`; set it to an empty value to turn it off).

The move to these models and to the core-and-tools structure was checked against a local stand-in for OpenAI: the instructions sent to the AI are word for word the same as before for the website and WhatsApp, both modes, voice and translation, and the PDF and Word documents are identical. It has not yet been run against the real new models. Before real users, run the golden and red-team tests and listen to replies in each language.

## Hosting on Google Cloud (Johannesburg)

inFORMed runs on **Google Cloud Run** in `africa-south1` (Johannesburg), under GRIT's Google Cloud organisation and billing account, next to Zuzi. The same code still runs on Vercel, so the demo can stay up until the new address is ready.

One-time setup (Windows Command Prompt, with the Google Cloud CLI installed and `gcloud auth login` done):

1. Create the project and connect billing (or do this in the Cloud console):
   `gcloud projects create informed-grit --organization=ORGANISATION_ID`
   `gcloud billing projects link informed-grit --billing-account=BILLING_ACCOUNT_ID`
2. Turn on the services:
   `gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project informed-grit`
3. Store the OpenAI key in Secret Manager (never in a file in the repo). Open a temporary Notepad file, paste the key, save, run one command, delete the file:
   `notepad %TEMP%\k.txt`
   `gcloud secrets create openai-key --data-file=%TEMP%\k.txt --project informed-grit`
   `del %TEMP%\k.txt`
4. Let Cloud Run read the secret (the project number is shown by `gcloud projects describe informed-grit`):
   `gcloud secrets add-iam-policy-binding openai-key --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor --project informed-grit`

Deploy (from the inFORMed folder, every time you want to publish changes):

`gcloud run deploy informed --source . --region africa-south1 --project informed-grit --allow-unauthenticated --set-secrets OPENAI_API_KEY=openai-key:latest --memory 1Gi --timeout 120 --max-instances 5`

The command prints the new address (ending in `.run.app`); `/form` opens straight on the form. `--max-instances 5` caps how many copies can run at once, which also caps cost. Other settings (for example `LIMIT_PER_HOUR`, `MODEL`) are added with `--update-env-vars NAME=value`. WhatsApp keys go into Secret Manager the same way as the OpenAI key.

Notes:
- Limits and WhatsApp conversations use Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Without it, each running copy counts and remembers on its own, which is rough for limits and loses WhatsApp conversations between copies. Upstash works from Google Cloud too.
- On Cloud Run, WhatsApp messages are answered before the webhook replies "ok" (Cloud Run stops a request once it has replied). Duplicate deliveries from Meta are ignored.
- To run it on your own computer: `npm install`, set `OPENAI_API_KEY`, then `node server.js` and open http://localhost:8080.

### On Vercel (the demo)

The demo keeps working on Vercel with the same code: `api/` runs as Vercel functions and `vercel.json` includes the government PDF. Settings are under **Settings → Environment Variables** (`OPENAI_API_KEY`, optional `DEMO_PASSCODE`, and the settings above).

### Limits

- `LIMIT_PER_HOUR` (default 150): messages one person can send in an hour (by internet address on the website, by chat on WhatsApp).
- `LIMIT_PER_DAY` (default 3000): messages across everyone per day. When it is reached, inFORMed says so and still gives the emergency numbers. Listening and voice recordings have their own separate limits.
- Also set a **monthly budget limit** on the OpenAI key (platform.openai.com → Settings → Limits), and a budget alert on the Google Cloud billing account. Those are the final safety nets for cost.

## WhatsApp (needs a Meta developer account)

**About using your own number:** a number connected to the WhatsApp Cloud API stops working in the normal WhatsApp app. For testing, use Meta's **free test number**. It can message up to five phone numbers you verify.

1. Go to developers.facebook.com → **My Apps → Create App** → type **Business** → add the **WhatsApp** product.
2. In **WhatsApp → API Setup**: note the **Phone number ID** of the test number, and add your own number under **To**.
3. Make a **permanent token**: business.facebook.com → **Settings → Users → System users** → add a system user (Admin) → **Add assets** → your app → **Generate token** with `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Settings: `WHATSAPP_TOKEN` (the permanent token, as a secret), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (any random string you choose), and Upstash Redis.
5. Meta app → **WhatsApp → Configuration → Webhook → Edit**: Callback URL `https://YOUR-ADDRESS/api/whatsapp`, the same verify token, then subscribe to **messages**.
6. From your verified phone, send "hi" to the test number. It asks for your language (and the access code first, if you set one).

Words the WhatsApp bot understands: `ASK`, `FILL`, `FORM`, `PDF`, `WORD`, `LANGUAGE`, `DELETE`, `HELP`. Voice notes work too.

## The form

**The PDF download is the real government form.** `lib/tools/protection-order/forms/J480E-2025-03.pdf` is the Department of Justice's own fillable Form 6 and Form 6A (court form J480E, March 2025, from justice.gov.za). `lib/tools/protection-order/official.js` fills its boxes and ticks its tick boxes directly, so the person downloads the official form, filled in. The Word download is an editable draft with the same sections and the same tick lists.

- **Tick boxes:** every official tick list is used: the capacity list (section 2), the relationship list (section 3), the 20 acts of domestic violence in 6(a), 6(b) to 6(i), Yes or No in 7(h), and the consent boxes on Form 6A. A box is ticked only when the person's answer names it (`pickOptions` in `public/fields.js`); nothing is guessed, and anything not on a list goes under "Other" in the person's own words. The form panel shows "Ticked on the official form:" under each list, so people can see and change it.
- **Long answers:** when an answer does not fit its box, the box says "See continuation, Annexure B" and the full answer goes on continuation pages. Form 6 continuations come straight after Form 6. Form 6A continuations come after Form 6A, so the personal details stay separate. Section 11 lists the annexures: A is Form 6A, then the continuation, then the person's own documents.
- **Left blank on purpose:** gender, race, disability and marital status (the clerk completes these), and Part B, the certificate, which the commissioner of oaths completes.
- **Two faults in the government PDF are worked around:** in 7(h), the Yes and No boxes are linked to two consent boxes on Form 6A (ticking one ticked the other), and a few boxes are stored upside down. Both are handled in `lib/tools/protection-order/official.js`.

**If the Department of Justice changes the form:** replacing the PDF file alone is not enough, because the box names and positions will change. Put the new PDF in `lib/tools/protection-order/forms/`, then update the box names in `lib/tools/protection-order/official.js` and the fields in `public/fields.js`. Check the Justice website for a new version before going live.

GRIT's original reference document and system prompt describe the older "Form 2" from the 1999 regulations, which were repealed. The model is told to use the Form 6/6A fields, and the reference document in `lib/tools/protection-order/knowledge.js` describes Form 6/6A.

## Keeping the form

- The chat is never saved.
- The form is kept in the open browser tab (sessionStorage), so a reload or a dropped connection loses nothing. Closing the tab, Quick exit or Start over clears it.
- "Save to finish later" locks the form with a PIN the person chooses (AES-GCM encryption, key derived with PBKDF2) and keeps it on that device only (localStorage). It is never sent to the server. "Continue a saved application" on the home page is always shown, so it does not reveal whether anything is saved. A forgotten PIN cannot be recovered.

## Visual design

The look follows Shamryn Brittan's GRIT design concept (October 2026): GRIT navy and blue, Hanken Grotesk, the paper-slip inFORMed wordmark, and paper-style form panel and dialogs. All the working features underneath are unchanged.

The design's images are in `public/img/` (Shamryn's files, compressed for the web): `bg-blue.webp` and `bg-blue-tall.webp` (page background on wide and tall screens), `about-grit.webp` (About GRIT photo), `community.webp` (first Good to know card), `grit-logo-blue.webp` and `logo-paper.webp` (logos). To replace a picture, put a new file in with the same name and push.

Direct-to-form link: `https://informedgrit.vercel.app/form` opens straight into "Help me fill in my form".

## Opening and "Read more"

The "Fill in my form" opening (proposed by GRIT, consent question left out) says inFORMed is an AI chatbot, not a person, and cannot give legal advice; that the story is only used for the form; that the person chooses what to share; that the form fills in as they talk, so they only tell their story once; how to use Quick exit; and to call 10111 if in danger. Under it are two buttons: **Start**, which shows "Tell me what is happening. You can type or talk.", and **Read more**. Typing or talking straight away also works. "Ask a question" opens with the same AI and legal advice disclosure.

"Read more" (also linked in the footer) covers: not a lawyer; who can see what you write (messages go to OpenAI to produce replies, OpenAI is asked not to keep them, GRIT does not see or store them); how long it is kept (the chat not at all; the form on the phone, PIN-locked if saved); how to delete it; the shared-phone risk; and the danger numbers. The wording is in `public/i18n.js` (`fillOpening`, `fillStart`, `startBtn`, `askOpening`, `iTitle`, `iH1`–`iH6`, `iP1`–`iP6`). The WhatsApp opening in `lib/tools/protection-order/openings.js` says instead that the chat is kept for 24 hours and how to delete it.

Read more also explains what happens after the form is finished (the clerk, the commissioner of oaths, the interim order, service, the return date and the final order, and reporting a breach), says that the magistrate decides and that using inFORMed does not guarantee an order or enforcement, and offers the GRIT app (with its panic button) in the danger section. The same steps appear in "Review your application". All of it is in English, isiZulu and Afrikaans (`aTitle`, `aS1`–`aS6`, `aNo`, `appAndroid`, `appIos` in `public/i18n.js`).

There is no consent question about using people's words to improve inFORMed, because nothing is stored or used for training. If GRIT later decides to collect conversations, consent would be added then, after a POPIA and safeguarding review.

## Protections and money as tick lists

When the main story and the urgency questions are done, inFORMed shows the person a **tick list of everything the court can order**, in plain words, instead of asking about each protection one by one. The options that fit their story come first (inFORMed chooses these), the rest are under "Show more options", and "Something else" is always last. Nothing is pre-ticked. "Not sure? Help me choose" lets them talk it through instead. Each choice ticks the matching box on the official form straight away (`CHOICES` in `public/fields.js`), and inFORMed then asks only for the details the chosen ones need, such as the work address. A second list covers money (lost pay, medical, moving, household, rent or bond, and maintenance until the court date), with a reminder to bring slips or receipts. On WhatsApp the same lists come as numbers ("Reply with the numbers, for example: 1, 3").

## Support when someone is distressed

When someone shows strong fear or distress but is not in immediate danger ("I am scared he can kill me"), inFORMed answers as usual and adds one fixed line underneath, with tap-to-call buttons: the GBV Command Centre (0800 428 428, free, 24 hours) and GRIT on WhatsApp (072 737 8819), and that they can pause. It is not repeated more than once every few messages. The wording is `SUPPORT` in `lib/core/safety.js`. Emergencies still get GRIT's fixed emergency replies, as before.

## Simple language

inFORMed matches how the person writes: short, simple sentences and everyday words for people who write simply, explaining any legal word, and a little more detail for people who write in a fuller way. It never corrects spelling or talks down to anyone. The form itself stays in formal English for the court.

## Evidence and "Things to bring to court"

GRIT's evidence guide is inFORMed's sixth reference document. inFORMed asks about evidence only when that part of the story comes up, one item at a time, always says the person can still apply without it, and never suggests getting evidence in a risky way. It keeps a list of what this person should bring (for example the clinic card or J88, screenshots of messages), shown with the items everyone needs (ID, the form, everything known about him, old case or OB numbers) as a tick list in "Review your application", at the end of the Word file (on its own page, marked as not part of the application) and on WhatsApp. It is not added to the official PDF.

## Home page and voice

- **The form comes first.** The main button is "Start my form". "Ask a question" is lower down, under "Want to learn more before you start?".
- **WhatsApp:** the header shows a WhatsApp button that says "WhatsApp: coming soon". When the WhatsApp channel is live, change the button in `public/index.html` (`id="waBtn"`) into a link to the WhatsApp number.
- **For people who find reading hard:**
  - "Listen: how this works" on the home page reads a short spoken guide (`guideAudio` in `public/i18n.js`).
  - The main actions have pictures as well as words.
  - In the chat, the microphone is the big button whenever the message box is empty, like sending a voice note.
  - A sound meter moves while someone speaks, so they can see the phone is hearing them.
- **Speaking instead of typing** works the same way everywhere, like a voice note:
  - Tap the microphone to start and tap it again to stop. It never stops on silence, because people often pause while telling a painful story.
  - There is a 3-minute safety limit. The timer turns orange at 2½ minutes. At 3 minutes it stops and keeps the words, and the person can record more.
  - Nothing is ever sent by itself. The words appear in the box with "Is this what you said?" and three buttons: **Hear it** (reads the words back, for people who cannot read them), **Say it again** and **Send**. People who can read can also correct the words by typing.
  - The AI is told when a message was spoken. It then gently repeats important details back ("Did I hear correctly that this happened on Friday 2 October?"), because names, dates and places are the words speech recognition gets wrong most. It also checks weapons (a misheard "gun" or "knife") and children, because both change how urgent the case is. This also applies to voice notes on WhatsApp.
- **Hear my form** (next to every Preview form button, and in the preview) reads the whole application aloud: every filled-in section, with its heading. The application is sworn evidence, and what the person says in court must match it, so people who cannot read need to know exactly what they are swearing to. In English it reads the exact words. In isiZulu or Afrikaans it first says that the form itself stays in English, then reads a faithful translation (made by `api/translate.js`, for listening only, limited to 40 per hour per internet address). The PDF and Word drafts are never translated.
- **Read aloud** (switch at the top of the chat, off by default) does only one thing: it reads every answer out loud by itself. When it is off, nothing plays unless someone taps Listen.
- **Faster listening:** long answers are read in pieces. The first piece is short, so it starts quickly, and the next piece loads while the one before is playing. Each piece counts towards the listening limit, which is now 600 per hour per internet address.

## Printing

"Print" sits next to Download in Review your application, and in the Preview bar. It prints the official Form 6 (J480E) PDF, the same file as Download PDF, not the on-screen preview. On a computer the print window opens straight away. Phones can't print a PDF from inside a web page, so on a phone the form opens in a new tab, where the phone's Share or Print option prints it.

## Page languages

Choosing isiZulu or Afrikaans switches all the page text: home page, buttons, chat messages, dialogs and help numbers. "Match my language" starts in the phone's language (if it is isiZulu or Afrikaans), and switches after the person's first message, in the language they wrote in. The form itself (form panel fields, preview, PDF and Word) stays in English, because it is filled in English for the court. This is enforced in code, not only asked of the AI: when the conversation is not in English, every form update goes through a separate translation step (`ensureEnglish` in `lib/core/language.js`) before it reaches the form, and anything typed into the form panel in another language is translated when the PDF or Word draft is made. Words someone said are kept in English with the original words in brackets. The scripted demo and the fixed safety replies are also still in English.

Changing the language also changes inFORMed's welcome, the Start question and the suggested questions already on the screen, with a short fade (they are tagged with their text key in `addMsg`). Answers the AI has already written stay as they were; new answers follow the new language. The Start question includes an example of how to begin.

All interface text is in `public/i18n.js`. The isiZulu and Afrikaans text is a **draft** and must be checked by GRIT's native speakers. To correct a line, change the text after the colon and keep the key before it. No other code needs to change.

## Sources (developer view)

Users do not see which document each answer came from. To see it, open the site with `?sources` at the end of the address (for example `https://YOUR-SITE.vercel.app/?sources`). The "Based on" labels and a "Sources (developer view)" button then appear for that browser tab. For WhatsApp, set `SHOW_SOURCES=1`. The "General information, not from GRIT's guides" label stays visible to everyone, because it tells people to check that answer with the court clerk.

## Safety design

- GRIT's trigger phrases are checked **before** the model is called, and answered word for word.
- The model also flags danger in any wording or language (`safety` field). When it does, its reply is **replaced** by the same fixed message. The model never writes a crisis reply.
- Crisis replies on the website show tap-to-call buttons (10111, 10177, GBV Command Centre).
- **Quick exit** button on every page: clears the page and goes to a weather search.
- Website conversations live only in the open browser tab. Nothing is saved on the server, and OpenAI is called with `store: false`.
- WhatsApp keeps the conversation in Redis for 24 hours (`CHAT_TTL_HOURS`), and `DELETE` removes it immediately.
- The model never logs what people write; only error messages are logged.

## Changes from GRIT's v8.14 system prompt

- The "is this conversation tracked" reply said the chat is used to train the bot. That is not true for this build (`store: false`), so it now says the chat is not saved after it is closed. Please confirm the wording with GRIT.
- A short block was added at the end telling the model how to return the form fields, the sources it used and a safety flag, and how to behave in Ask mode (plain answers, labelled general-knowledge fallback, keep the conversation going). The original prompt is otherwise unchanged.
- GRIT's approved protection order guide (Zuzi KB LEGAL-01) was added as a fifth source, mainly for Ask mode.

## Before real users (not needed for the demo)

- Voice: test isiZulu speech recognition and read-aloud with native speakers. They are passed as hints, and quality for isiZulu is not yet known. Afrikaans and English are supported directly.
- isiZulu and Afrikaans replies are written by the model. Native speakers at GRIT should review them, and the fixed safety replies need GRIT-approved translations (currently sent in English).
- Safeguarding sign-off on the crisis replies and flow.
- Verify Meta's webhook signature (`X-Hub-Signature-256`) against the raw request body.
- A shared rate limit (the current one is per server instance) and a POPIA review of the 24-hour bot storage.
- Brand colours are taken from the GRIT logo (navy, teal, indigo). Change the tokens at the top of `public/index.html` if GRIT has official colour codes.
- Using conversations to improve the bot needs survivors' informed opt-in consent, POPIA compliance and GRIT's written authorisation and safeguarding sign-off. This build saves nothing for training.
