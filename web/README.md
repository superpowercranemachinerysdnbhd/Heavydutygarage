# Heavyworks Garage — workshop app (Phase 1)

Next.js 16 web app with a PostgreSQL database. Works on desktop, tablet and phone (add it to the phone's home screen).

## What Phase 1 covers

- **Sign-in** by phone number and password, one account per person. Roles: Boss, Supervisor, Mechanic, Assistant Mechanic, Fabricator, Painter, Cleaner.
- **Dashboard:** open jobs, emergencies, overdue, workshop floor (bays, yards, field jobs), job board by status with days-in-status, crew today, needs-attention list.
- **Jobs:** create (incl. emergency call-out), categories and priorities, lead and team, tasks, photos (before / during / after / QC), labour hours, diagnosis, activity log, QC checklist, customer handover with on-screen signature, printable service report.
- **Machinery:** machines with owner, serial, hour meter, location, days on premises, service history, printable history report; model library with specs, service intervals and a known-issues knowledge base.
- **Customers** with their machines and jobs.
- **Team:** profiles, chain of command, skills, certificates and permit expiry, account management.

### Languages

English, Bahasa Melayu and 中文 (Simplified Chinese).

- Each person picks their language from the top bar (or the sign-in page). It is saved on their account, so a mechanic can work in Bahasa Melayu while the Boss uses Chinese. The Boss can also set it on the staff profile.
- Each customer has a **report language**. Service reports and machine history reports print in it, and it can be changed on the report page before printing.
- Built-in text is translated: menus, statuses, categories, roles, QC checklist items, messages and the job activity history. Text people type (complaints, diagnosis, notes, tasks) is shown as typed.
- All text lives in `src/i18n/en.ts`, `ms.ts` and `zh.ts`. A test fails if any language is missing a phrase. To add a language (e.g. Tamil, Bengali, Nepali), copy `en.ts`, translate it, and add the code to `LOCALES` in `src/i18n/index.ts`.

### Rules enforced on the server

| Rule | Where |
|---|---|
| Crew see and update only jobs they lead or are on | `src/lib/permissions.ts` (`canWorkOnJob`) |
| Crew can only move a job between Diagnosing, In Progress and Quality Check | `src/lib/jobs.ts` (`checkTransition`) |
| A job cannot be released while tasks are open or QC is incomplete | `checkTransition` |
| A job cannot be closed without the customer handover and signature | `checkTransition` |
| Only the Boss sees pay rates, labour cost and margins | `can(role, "money.labourCost")` |
| Crew see no prices at all | `can(role, "money.selling")` |
| Only the Boss creates staff accounts and resets passwords | `can(role, "staff.manage")` |

## Run it locally

Needs Node.js 22 and PostgreSQL 14 or newer.

```bash
cd web
npm install
cp .env.example .env            # then edit DATABASE_URL if needed
npm run db:migrate              # create the tables
npm run user:create -- --name "Your Name" --phone 0123456789 --role boss --password "choose-a-password"
npm run dev                     # http://localhost:3000
```

To try it with example data instead (only works on an empty database):

```bash
npm run db:seed                 # demo logins: Boss 0120000000, Supervisor 0120000001, Mechanic 0120000003; password demo-pass-1
```

## Checks

```bash
npm test          # permission and job-rule tests
npm run typecheck
npm run build
```

## Going live (next step)

1. A managed PostgreSQL database (e.g. AWS RDS or DigitalOcean, Singapore region) with daily backups.
2. Host the app (e.g. a small VPS with `npm run build && npm start` behind HTTPS, or a platform like Render/Railway).
3. Photos and signatures are stored in `STORAGE_DIR` on disk. For a cloud host, point this at a persistent volume or switch `src/lib/storage.ts` to S3-compatible storage.
4. Create the Boss account with `npm run user:create`, then add staff from the Team page.

## Not in Phase 1 (planned)

Parts & inventory, suppliers and purchase orders (Phase 2); weekly schedule and PM reminders (Phase 3); quotes, invoices and Boss reports (Phase 4); WhatsApp, QR labels, offline mode (Phase 5).
