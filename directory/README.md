# Service directory

The directory lists the places and services people can be referred to: Magistrates' Courts, police stations, Thuthuzela Care Centres, shelters, counselling, Legal Aid South Africa, helplines, health and social development services. It is shared with Zuzi, and kept in Firestore in Johannesburg (collection `services`, project `informed-grit`).

inFORMed does not use it in conversations yet. It is set up now so that every entry is collected and checked the same way from the start.

## How entries are kept

The working copy is a spreadsheet, kept in GRIT's Google Drive, not in GitHub (this repository is public, and the sheet holds the names of the people who checked each entry and internal notes). Start from `template.csv`, which has the column names.

| Column | What to write |
|---|---|
| service_id | A short unique id: province, place, type, for example `gp-protea-magistrates-court` |
| name | The service's official name |
| type | magistrates_court, police_station, thuthuzela_care_centre, shelter, counselling, legal_aid, helpline, health, social_development, child_protection, advocacy or other |
| referral_tier | 1 survivor-led support (offered first), 2 legal and statutory routes, 3 emergency services. The same tiers as Zuzi |
| province | EC, FS, GP, KZN, LP, MP, NC, NW, WC, or national for a national helpline |
| town, address | Where it is |
| phone, phone_alt, whatsapp | South African numbers, for example 012 345 6789, 0800 428 428, 10111 or a USSD code |
| email, website | If they have one; websites start with https:// |
| hours | Opening hours in plain words, for example "Weekdays 08:00 to 16:00" |
| after_hours | yes, no or unknown |
| languages | Language codes separated by ; for example `zu;en` |
| services | What they offer, in plain words |
| cost | free, fee or unknown |
| who_can_use | Anyone who can or cannot use it, for example "women and children only" |
| source | Where the information came from (Department of Justice court list, SAPS station list, a phone call, a partner) |
| contact_status | verified (someone phoned or visited and confirmed it), partially_verified, not_verified |
| last_checked | The date it was last checked, YYYY-MM-DD |
| checked_by | Who checked it |
| active | yes, or no if the service has closed or should not be used |
| internal_note | Notes for GRIT only. Never shown to anyone using inFORMed or Zuzi |

## The rule for showing an entry

An entry is only ready to be shown to people when it is active, verified, and was checked in the last 6 months. Anything else is kept but not shown. Every entry has to be checked again 6 months after its last check.

## Commands

Check the spreadsheet (save it as CSV first):

```
npm run directory check C:\Users\EDGI\Downloads\services.csv
```

It lists every row with a problem, and every entry that is not ready (not verified, or due for a check).

Load it into Firestore (in Google Cloud Shell, which already has access to the project):

```
git clone https://github.com/zione-grit/inFORMed_Grit.git
cd inFORMed_Grit
npm ci
npm run directory upload services.csv
```

Upload the CSV into Cloud Shell first (the three-dot menu → Upload). Nothing is uploaded if any row has a problem.
