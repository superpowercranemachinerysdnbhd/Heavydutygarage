# Heavyworks Garage — workshop app (Phases 1 and 2)

Next.js 16 web app with a PostgreSQL database. Works on desktop, tablet and phone (add it to the phone's home screen).

## What Phase 1 covers

- **Sign-in** by phone number and password, one account per person. Roles: Boss, Supervisor, Mechanic, Assistant Mechanic, Fabricator, Painter, Cleaner.
- **Dashboard:** open jobs, emergencies, overdue, workshop floor (bays, yards, field jobs), job board by status with days-in-status, crew today, needs-attention list.
- **Jobs:** create (incl. emergency call-out), categories and priorities, lead and team, tasks, photos (before / during / after / QC), labour hours, diagnosis, activity log, QC checklist, customer handover with on-screen signature, printable service report.
- **Machinery:** machines with owner, serial, hour meter, location, days on premises, service history, printable history report; model library with specs, service intervals and a known-issues knowledge base.
- **Customers** with their machines and jobs.
- **Team:** profiles, chain of command, skills, certificates and permit expiry, account management.

### Phase 2: parts, stock and purchasing

- **Parts catalogue:** our part no. and OEM no., category, unit, bin, minimum and reorder quantity, which machine models each part fits (or "fits all").
- **Supplier prices are a history, never overwritten.** Every price is saved with its date and source: phone/WhatsApp quote, purchase order, supplier invoice, or imported price list. The part page shows each supplier's latest price, cheapest first, with the % change and the full history.
- **Purchase orders:** tap a supplier's price on each line or type a new one; a price more than 10% away from that supplier's last price shows a warning. Add a new supplier from the PO line without leaving the page. One PO is raised per supplier. POs over RM 5,000 raised by the Supervisor wait for Boss approval. Printable PO with the supplier's own part codes.
- **Receiving:** enter the invoice/DO number, quantity and the price on the invoice. Stock goes up, the **weighted average cost** is recalculated, and an invoice price that differs from the PO is saved to the price history and flagged to the Boss.
- **Selling prices:** per category markup (selling price follows average cost automatically) or a fixed price per part. The Boss is alerted when a fixed-price part's margin falls below the category target.
- **Price list import:** upload a supplier's price list saved as CSV; parts are matched by our part no., OEM no. or the supplier's code; unmatched rows and big changes are listed.
- **Parts on jobs:** crew request parts on the job page (only parts that fit the machine); the Supervisor issues them (stock down, cost and selling price snapshotted on the job) or orders them. Job value, service reports and machine history now include parts.
- **Stock-take:** count on the shelf and give a reason; every movement (received, issued, adjusted) is logged with balance, person and reference.
- **Who sees what:** crew see stock, bins and fits but no prices; the Supervisor sees purchase and selling prices but not margins; the Boss sees margins, approves big POs and sets selling prices and markups.

### Languages

English, Bahasa Melayu and 中文 (Simplified Chinese).

- Each person picks their language from the top bar (or the sign-in page). It is saved on their account, so a mechanic can work in Bahasa Melayu while the Boss uses Chinese. The Boss can also set it on the staff profile.
- Each customer has a **report language**. Service reports and machine history reports print in it, and it can be changed on the report page before printing.
- Built-in text is translated: menus, statuses, categories, roles, QC checklist items, messages and the job activity history. Text people type (complaints, diagnosis, notes, tasks) is shown as typed.
- All text lives in `src/i18n/en.ts`, `ms.ts` and `zh.ts`. A test fails if any language is missing a phrase. To add a language (e.g. Tamil, Bengali, Nepali), copy `en.ts`, translate it, and add the code to `LOCALES` in `src/i18n/index.ts`.

### Chat

- **Job chat** on every job page (and in Chat). People on the job, the Supervisor and the Boss can read it.
- **Workshop** chat for all staff, and **private messages** between two people. The Boss cannot read other people's private messages.
- Text and photos (camera on phones). New messages appear within about 4 seconds; the Chat tab shows an unread count.
- Built-in chat text is translated; messages are shown as typed. Anyone who can see prices gets a reminder not to post costs in chats mechanics can read.
- Code: `src/lib/chat.ts` (queries), `src/lib/chat-rules.ts` (who can read what, tested), `src/app/api/chat/` (messages, photos, unread count), `src/components/ChatRoom.tsx`.

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
npm run db:seed                 # demo jobs, parts, suppliers and POs; demo logins: Boss 0120000000, Supervisor 0120000001, Mechanic 0120000003; password demo-pass-1
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

## Not built yet (planned)

Weekly schedule and PM reminders (Phase 3); quotes, invoices and Boss reports (Phase 4); WhatsApp, QR labels, offline mode (Phase 5).
