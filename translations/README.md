# Translations

inFORMed works in all 11 written official languages of South Africa: English, isiZulu, isiXhosa, Afrikaans, Sepedi, Setswana, Sesotho, Xitsonga, siSwati, Tshivenḓa and isiNdebele.

- **The conversation** is written by the AI in the person's language, in every language, from the first message.
- **The fixed wording** (the website's buttons and pages, GRIT's emergency replies, the support line, the limits and the WhatsApp messages) comes from translation files. The AI translation model makes the first version; GRIT's native speakers check it later.
- **The form** is always completed in English, because it goes to court.

## Where the translations are

`public/i18n/<code>.json`, one file per language, kept in GitHub: `zu` isiZulu, `xh` isiXhosa, `af` Afrikaans, `nso` Sepedi, `tn` Setswana, `st` Sesotho, `ts` Xitsonga, `ss` siSwati, `ve` Tshivenḓa, `nr` isiNdebele. The English is the source: the website's in `public/i18n.js`, the rest in the code where it is used.

Every line has a status:

| Status | Meaning |
|---|---|
| machine | made by the AI translation model |
| draft | written earlier, not yet checked by a native speaker |
| checked | checked or written by a native speaker |

## Safety rules built in

- A translation is only used if it keeps every phone number, web address, placeholder (like `{n}`), command word (ASK, FILL, DELETE...) and formatting tag of the English. Otherwise the English is used. A wrong or missing emergency number can never reach anyone.
- If the English changes after a line was translated, the old translation is not used until it is translated again.
- Anything not translated yet is shown in English.

## Commands (Command Prompt, in the inFORMed folder)

See how far each language is:

```
npm run translations
```

Translate everything missing, with the AI model. It needs the OpenAI key for this window only (Notepad file, then delete it):

```
notepad %TEMP%\k.txt
set /p OPENAI_API_KEY=<%TEMP%\k.txt
del %TEMP%\k.txt
npm run translations fill
```

It takes a few minutes for all ten languages and costs very little. Then `git add -A`, `git commit` and `git push`, and deploy. `npm run translations fill zu xh` does only some languages. Run it again whenever English wording is added or changed.

Give a language to a native speaker to check:

```
npm run translations export
```

This writes `translations/<code>.csv`, which opens in Excel or Google Sheets. The translator changes the **translation** column where needed and writes **checked** in the **status** column for every line they have checked. Keep the file name (for example `zu.csv`). To read it back:

```
npm run translations import translations\zu.csv
```

Lines the translator changed, or marked checked, become **checked**. A line that loses a number, link, command word or tag is not taken, and the command says which.

## Before real users

The emergency replies, the support line and the opening messages in each language should be checked by a native speaker and the safeguarding lead first. `npm run translations` shows what is still made by the model.
