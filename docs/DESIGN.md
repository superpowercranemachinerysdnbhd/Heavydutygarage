# Heavyworks Garage — Workshop Management System Design

Software for running a heavy machinery service and repair workshop: emergency breakdown response, troubleshooting and diagnostics, preventive maintenance, hydraulic services, fabrication and painting.

A clickable prototype of the main screens lives in [`prototype/index.html`](../prototype/index.html).

---

## 1. Goals

1. **One screen to see the whole workshop.** Every job, its status, who is on it and what it is waiting for.
2. **A linear chain of command.** Boss → Supervisor → Mechanics → support crew. Work flows down, reports flow up, and nothing moves without an owner.
3. **Every machine has a memory.** Each unit keeps its full service history, photos, hour-meter readings and parts used, so a machine that has been with us for months (or comes back years later) can be looked up in seconds.
4. **Parts are found by machine model.** Pick "CAT 320D2" and see the filters, seal kits and wear parts that fit, what they cost us, what we sell them for and how many are on the shelf.
5. **Plan the work against due dates.** A calendar of target completion dates, PM services coming due and staff availability.
6. **Usable from the workshop floor.** Mechanics update jobs and take photos from a phone. The supervisor and boss use a desktop or tablet.

---

## 2. Roles and permissions

The structure stays linear: each person reports to exactly one level up.

```
Boss (Owner / Manager)
 └── Supervisor  (operations + parts & inventory)
      ├── Mechanics (lead technicians on jobs)
      │    └── Assistant Mechanics
      ├── Fabricators / Welders
      ├── Painters
      └── Cleaners
```

| Capability | Boss | Supervisor | Mechanic | Asst. Mechanic | Fabricator / Painter | Cleaner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| See dashboard of all jobs | ✓ | ✓ | Own jobs | Own jobs | Own jobs | Own tasks |
| Create job / emergency call-out | ✓ | ✓ | Request only | – | – | – |
| Assign / reassign staff | ✓ | ✓ | – | – | – | – |
| Update job status, tasks, notes | ✓ | ✓ | ✓ (own) | Tasks only | ✓ (own) | Tasks only |
| Upload photos | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Log labour time | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Request parts for a job | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Issue parts from stock | ✓ | ✓ | – | – | – | – |
| See **selling** price of parts, job value | ✓ | ✓ | – | – | – | – |
| See **purchase** price of parts, supplier terms | ✓ | ✓ | – | – | – | – |
| See labour cost, pay rates, margins and job profit | ✓ | – | – | – | – | – |
| Create purchase orders | ✓ | ✓ (limit, e.g. RM 5,000) | – | – | – | – |
| Approve POs above limit, quotes, discounts | ✓ | – | – | – | – | – |
| Quality check & close job | ✓ | ✓ | – | – | – | – |
| Invoicing and financial reports | ✓ | View | – | – | – | – |
| Staff profiles | ✓ | View (no pay rates) | Own profile | Own profile | Own profile | Own profile |

**Cost visibility rule:** the Boss sees every cost. The Supervisor sees part purchase prices only (needed to buy stock and raise POs), never labour cost, pay rates or margins. Mechanics and crew see no prices at all, neither cost nor selling price.

Everyone logs in with their own account, which gives a clean audit trail ("who changed this job to Completed, and when").

---

## 3. Job categories

Each job gets one **category** (what kind of work), a **priority** and a **service location**.

| Code | Category | Typical work | Default priority |
|---|---|---|---|
| EMG | Emergency Breakdown | Machine down at site, call-out, 24/7 | Critical |
| DIAG | Troubleshooting & Diagnostics | Fault codes, intermittent faults, electrical, performance loss | High |
| PM | Preventive Maintenance | 250 / 500 / 1000 / 2000 hr services, inspections | Normal |
| MINOR | Minor Repair | Hoses, brakes, lights, small leaks, adjustments | Normal |
| MAJOR | Major Repair / Overhaul | Engine, transmission, final drive, swing motor rebuilds | Normal |
| HYD | Hydraulic Service | Pump/valve/cylinder reseal, hose making, pressure testing | High |
| FAB | Fabrication & Welding | Bucket rebuild, hardfacing, crack repair, custom brackets | Normal |
| PAINT | Painting & Refurbishment | Surface prep, full repaint, decals, cosmetic restoration | Low |
| WARR | Warranty / Comeback | Repeat of a recent repair, tracked against the original job | High |

**Service location:** Workshop (bay number) or Field (customer site with address, GPS pin and travel time).

**Priority:** Critical (machine down, respond now), High (within 24 h), Normal (scheduled), Low (fill-in work).

A job can carry **secondary tags** when it spans several trades, for example a refurbishment that is MAJOR + FAB + PAINT. Each trade gets its own task lines and assigned person inside the job.

---

## 4. Job lifecycle

```mermaid
stateDiagram-v2
    [*] --> Received
    Received --> Diagnosing : assigned to mechanic
    Diagnosing --> AwaitingApproval : quote sent to customer
    AwaitingApproval --> AwaitingParts : approved, parts not in stock
    AwaitingApproval --> InProgress : approved, parts in stock
    Diagnosing --> InProgress : pre-approved work (PM, contract)
    AwaitingParts --> InProgress : parts received
    InProgress --> QualityCheck : mechanic marks done
    QualityCheck --> InProgress : failed QC
    QualityCheck --> ReadyForPickup : supervisor passes QC
    ReadyForPickup --> Closed : delivered, invoiced
    Closed --> [*]
```

| Status | Who moves it | What it means on the dashboard |
|---|---|---|
| Received | Supervisor | Machine/call logged, nobody working on it yet. Flags red if Critical and unassigned. |
| Diagnosing | Mechanic | Inspection and fault finding under way. |
| Awaiting Approval | Supervisor | Quote sent, waiting on customer. Shows days waiting. |
| Awaiting Parts | Supervisor | Linked to purchase order(s), shows ETA. |
| In Progress | Mechanic | Repair under way. |
| Quality Check | Supervisor | Test run, pressure readings, leak check, sign-off photos. |
| Ready for Pickup | Supervisor | Customer notified. Storage-day counter starts. |
| Closed | Boss / Supervisor | Delivered and invoiced. Becomes part of the machine's service history. |

**On Hold** can be applied on top of any status, with a reason (customer request, payment, waiting for specialist).

---

## 5. Modules

### 5.1 Dashboard

The home screen, laid out so a glance answers "what needs me right now?".

- **Status strip:** open jobs, active emergencies, overdue jobs, jobs due this week, staff on duty, low-stock items.
- **Job board:** kanban columns by status. Each card shows job number, category colour, priority stripe, machine, customer, lead mechanic and due date (red when overdue). Click a card to open the full job.
- **Active crew panel:** every staff member with their state today (On job / In field / Available / On leave) and the job they are on.
- **Attention list:** unassigned emergencies, quotes waiting more than 3 days, parts overdue from supplier, jobs past due date, machines in the yard longer than 30 days.
- **Boss-only tiles:** work-in-progress value, this month's invoiced revenue, labour utilisation.

### 5.2 Jobs (job card)

Opening a job shows everything about it on one page:

| Section | Contents |
|---|---|
| Header | Job no. (e.g. `J-2026-0418`), category, priority, status, service location, opened / due dates, days open |
| Machine | Model, serial no., hour meter at intake, owner, link to the machine's history |
| Customer complaint | What the customer reported, in their words, plus who called and contact number |
| Diagnosis | Mechanic's findings, fault codes, test readings (pressures, temperatures) |
| Tasks / checklist | Ordered task lines, each with assignee and done tick. PM jobs load a checklist template for the service interval |
| Team | Lead mechanic plus assistants, fabricator, painter, cleaner |
| Labour | Time entries per person (clock on / off a job from the phone) |
| Parts used | Parts issued from stock or ordered for this job, with quantity, selling price (and cost for supervisor/boss) |
| Photos | Before / during / after photos, tagged and captioned, taken from phone camera. Also videos (engine noise, leaks) |
| Documents | Quote, customer approval, delivery order, invoice, test reports |
| Activity log | Every status change, note and update with time and name |
| Sign-off | QC checklist, supervisor sign-off, customer signature on handover |

**Emergency call-out flow (EMG):**

1. Supervisor logs the call: customer, site location, machine, symptom, contact on site.
2. System suggests available mechanics with the right skill (e.g. hydraulics, crane) and shows who is nearest.
3. Mechanic accepts on phone → status *In field*, travel time starts.
4. On arrival: safety checklist (lock-out / tag-out, area barricaded), before photos.
5. Fix on site or recover the machine to the workshop (job continues as a workshop job).
6. Call-out charge, travel and after-hours rates applied automatically.

### 5.3 Calendar and planning

- **Month / week / day views.** Jobs show on their target due date, coloured by category.
- **PM forecast:** upcoming services calculated from each machine's hour meter and average daily usage, shown as dashed entries.
- **Staff lane view (week):** one row per person, so the supervisor sees who is overloaded and who is free; drag a job onto a person to assign it.
- **Leave and public holidays** block out staff days.
- **Overdue** jobs stay visible and flagged until they move.

### 5.4 Machinery

Two levels:

**Model library** (the reference shelf), one entry per make/model we commonly work on:

- Make, model, type (excavator, RT crane, wheel loader, forklift…), operating weight, engine, hydraulic pump
- Service intervals and the checklist for each interval
- **Parts catalogue for this model:** filters, seal kits, wear parts, linked to inventory with stock levels and prices
- **Known issues and fixes:** a knowledge base the team builds over time ("PC200-8 pump pressure loss — check pilot pressure first")
- Fluid capacities and torque specs
- Manuals, wiring and hydraulic diagrams (PDF upload)

**Units** (each individual machine):

- Serial / chassis no., engine serial, registration / plate, year
- Owner (customer), operator contact
- Current hour meter (updated at every job), location (workshop bay, long-stay yard, customer site)
- **Days on premises** with a long-stay flag (e.g. > 30 days) and optional storage charges
- **Service history timeline:** every job ever done on this unit, filterable by category, with photos, parts and hour meter at that time
- Next PM due, open jobs
- QR code sticker on the machine: scan with a phone to open its page

### 5.5 Parts and inventory (run by Supervisor)

- **Part record:** part no. (OEM and internal SKU), description, category, compatible models, bin location, unit of measure
- **Pricing:** purchase price (last and average), selling price, margin %, price history per supplier
- **Stock:** on hand, reserved for jobs, on order, minimum level, reorder quantity
- **Suppliers:** contact, payment terms, lead time, parts supplied, price comparison across suppliers
- **Purchase orders:** create from low-stock list or from a job's parts request; receive goods (full or partial) and stock updates automatically
- **Stock movements:** every in/out tied to a PO, job, adjustment or stock-take, so stock can always be reconciled
- **Stock-take:** count by bin location on a phone, with variance report
- **Fluids and consumables:** oils, grease, welding rods, paint and abrasives tracked by litre, kg or metre

### 5.6 Team

- **Profile:** name, photo, role, reports-to, phone, IC/passport no. and work-permit expiry (for foreign workers), emergency contact, join date
- **Skills matrix:** engine, hydraulics, electrical/diagnostics, cranes, welding (with positions), painting, with skill level
- **Certifications with expiry reminders:** DOSH competency (e.g. crane operator/inspector), CIDB green card, welding certificates, forklift licence, first aid
- **Workload:** current jobs, hours logged this week, utilisation (billable vs. clocked hours)
- **Performance:** jobs completed, comebacks, average job duration by category
- **Leave and attendance**
- **Pay rates** (Boss only), used for internal labour costing and margin. Hidden from the Supervisor.

### 5.7 Customers, quotes and invoicing

- Customer records with sites, contacts and credit terms
- Quote built from the job's diagnosis: labour estimate, parts at selling price, call-out and travel
- Customer approval captured (signature, or a WhatsApp/e-mail approval attached)
- Invoice generated from actual labour and parts on the job, with SST where applicable
- Statement of account and outstanding balance per customer

### 5.8 Reports

- Jobs by category, status and mechanic over a period
- Revenue and gross margin by category (Boss only) (which line of business earns most: hydraulics, fabrication, painting…)
- Mechanic utilisation and productivity
- Turnaround time per category, and on-time completion rate
- Comeback rate per mechanic and per job category
- Inventory valuation, slow-moving and dead stock, parts margin
- Machines with the highest repair cost (useful to advise customers on replacement)

---

## 6. Data model

```mermaid
erDiagram
    CUSTOMER ||--o{ MACHINE_UNIT : owns
    MACHINE_MODEL ||--o{ MACHINE_UNIT : "is model of"
    MACHINE_MODEL }o--o{ PART : "compatible with"
    MACHINE_MODEL ||--o{ KNOWN_ISSUE : has
    MACHINE_UNIT ||--o{ JOB : "serviced in"
    MACHINE_UNIT ||--o{ HOUR_READING : records
    CUSTOMER ||--o{ JOB : requests
    JOB ||--o{ JOB_TASK : contains
    JOB ||--o{ JOB_PART : uses
    JOB ||--o{ LABOUR_ENTRY : logs
    JOB ||--o{ PHOTO : has
    JOB ||--o{ ACTIVITY : logs
    JOB ||--o| QUOTE : has
    JOB ||--o| INVOICE : billed_by
    STAFF ||--o{ JOB : leads
    STAFF ||--o{ JOB_TASK : "assigned to"
    STAFF ||--o{ LABOUR_ENTRY : works
    STAFF ||--o{ CERTIFICATION : holds
    PART ||--o{ JOB_PART : "issued as"
    PART ||--o{ STOCK_MOVEMENT : moves
    SUPPLIER ||--o{ PART_PRICE : quotes
    PART ||--o{ PART_PRICE : priced
    SUPPLIER ||--o{ PURCHASE_ORDER : receives
    PURCHASE_ORDER ||--o{ PO_LINE : contains
    PART ||--o{ PO_LINE : ordered
```

Key fields:

| Entity | Key fields |
|---|---|
| `job` | job_no, category, priority, status, on_hold_reason, location_type (workshop/field), bay or site address, machine_unit_id, customer_id, complaint, diagnosis, lead_staff_id, opened_at, due_date, closed_at, hour_meter_in, hour_meter_out, parent_job_id (for comebacks) |
| `job_task` | job_id, sequence, description, assignee_id, trade, done_at |
| `job_part` | job_id, part_id, qty, unit_cost (snapshot), unit_price (snapshot), source (stock / PO) |
| `labour_entry` | job_id, staff_id, start, end, hours, rate_type (normal / OT / after-hours) |
| `photo` | job_id, file_url, stage (before / during / after / QC), caption, taken_by, taken_at |
| `machine_model` | make, model, type, specs (JSON), service_intervals, fluid_capacities |
| `machine_unit` | model_id, customer_id, serial_no, engine_no, plate_no, year, hour_meter, location, arrived_at, qr_code |
| `part` | sku, oem_part_no, description, category, uom, bin_location, on_hand, reserved, min_level, reorder_qty, avg_cost, sell_price |
| `part_price` | part_id, supplier_id, price, date, lead_time_days |
| `staff` | name, role, reports_to_id, phone, id_no, permit_expiry, skills (level per skill), pay_rate, active |
| `certification` | staff_id, name, number, issued, expiry |

Job number format: `J-YYYY-NNNN`, running per year.

---

## 7. More ideas to make it better

**On the workshop floor**
1. **QR codes on machines and job tags.** A tag hung on the machine at intake; scanning it opens the job on any phone. Saves searching.
2. **Phone-first job updates with offline mode.** Mechanics in a yard or at a quarry often lose signal. Updates and photos queue and sync when back online.
3. **Clock on / clock off per job.** Gives real job costing and shows which jobs overrun their estimate.
4. **Voice notes** transcribed into the job notes, for greasy hands.
5. **Safety checklists** before work starts: lock-out/tag-out, lifting plan for crane work, hot-work permit for welding, confined space. Required before status can go to In Progress.
6. **Tool and equipment checkout.** Track special tools (pressure test kits, diagnostic laptops, torque multipliers) and calibration due dates.

**Customer service**
7. **WhatsApp notifications** to customers at key stages (received, quote ready, ready for pickup) with photos. In Malaysia this is how most customers prefer to be reached.
8. **Customer approval link:** customer opens the quote with photos and approves on their phone; approval is stored on the job.
9. **Customer portal** for fleet owners: their machines, service history and upcoming PM.
10. **Before/after photo report** auto-generated as a PDF when the job closes, to send with the invoice. Builds trust and justifies the bill.

**Planning and control**
11. **PM reminders by hour meter**, not just by date. Ask customers for hour readings monthly (or via telematics such as CAT Product Link / Komtrax where available) and the system forecasts the due date.
12. **Comeback tracking:** a WARR job links to the original job and mechanic, so repeat failures are visible.
13. **Estimate vs actual** for hours and parts on every job, to improve quoting.
14. **Long-stay yard management:** days on premises, storage charges after a free period, and a yard map.
15. **Parts reservation:** when parts are issued to a job, they are reserved so they are not used elsewhere.
16. **Oil and fluid analysis records** per unit, trended over time, to predict failures.
17. **Core / exchange tracking** for pumps, starters and alternators sent out for exchange.
18. **Sublet work** (e.g. machining, injector calibration sent out) tracked as a cost line on the job.

**Management**
19. **Daily summary for the boss** at 6 pm: jobs closed, new jobs, emergencies, revenue, issues.
20. **Audit trail** on prices, stock adjustments and job status changes.
21. **Accounting export** (e.g. to SQL Accounting, AutoCount or Xero) so invoices are not typed twice.
22. **Backups and access control**: daily automatic backups; staff accounts disabled the day someone leaves.

---

## 8. Technical approach

**Recommended: web application installed as a phone app (PWA).**

| Layer | Choice | Why |
|---|---|---|
| Front end | React (Next.js) with a responsive layout | One codebase for desktop, tablet and phone; installable on Android/iOS home screen; camera access for photos |
| Back end | Next.js API routes or Node/NestJS | Same language end to end; simple to hire for |
| Database | PostgreSQL | Relational data (jobs ↔ parts ↔ machines) and reliable reporting |
| Photo/file storage | S3-compatible object storage | Photos are large; keep them out of the database. Compress on upload |
| Auth | Email/phone login with roles | Permissions per role as in section 2 |
| Notifications | WhatsApp Business API, e-mail, push | Customer and staff alerts |
| Hosting | Managed cloud (e.g. AWS Singapore/Malaysia region) | Low latency, automatic backups |

**Alternative:** start on a configurable platform (e.g. Airtable/AppSheet/Odoo) to prove the workflow cheaply, then build custom once the process is settled. The trade-off is less control over permissions, offline use and cost at scale.

---

## 9. Rollout plan

| Phase | Scope | Outcome |
|---|---|---|
| 1 — Core (6–8 weeks) | Jobs, dashboard, machinery units, customers, staff, photos, roles | Paper job cards retired; boss sees all jobs live |
| 2 — Parts (4–6 weeks) | Inventory, suppliers, purchase orders, parts on jobs, model parts catalogue | Stock levels trusted; parts found by model |
| 3 — Planning (3–4 weeks) | Calendar, staff lanes, PM forecasts, reminders | Due dates planned; PM work booked ahead |
| 4 — Money (4 weeks) | Quotes, approvals, invoices, accounting export, reports | Billing from the job card; margin per category |
| 5 — Extras | WhatsApp, customer portal, QR tags, offline mode, telematics | Faster service, fewer phone calls |

Before phase 1, load the existing data: current machines in the workshop and yard, the customer list, the staff list and an initial stock count.

---

## 10. Open questions for the owner

1. How many jobs are open at a typical time, and how many staff will log in?
2. Are labour rates fixed per hour, per trade, or quoted per job?
3. Which accounting software is used today?
4. Do any customers have service contracts (fixed monthly PM) that need separate billing?
5. Is SST registration in place (affects invoice format)?
6. Is there more than one workshop or yard location?

---

## 11. Agreed additions (October 2026)

These were chosen by the owner from the improvement list and are shown working in the prototype.

| # | Feature | How it works | Who |
|---|---|---|---|
| 1 | **Parts request & approval** | Mechanic taps *Request part* on the job (part list filtered to the machine model). Supervisor sees requests on the dashboard and in Parts → Requests, then **Issues** (stock goes down, part is added to the job, movement recorded) or **Rejects**. Issuing more than is on the shelf is blocked. | Request: crew on the job. Issue/reject: Supervisor, Boss |
| 2 | **QC checklist before release** | Every job gets a QC list (5 standard checks + 1 per category, e.g. "Pressure readings recorded against spec" for hydraulics). The job cannot move to *Ready for Pickup* until every item is ticked. | Supervisor, Boss |
| 4 | **Customer sign-off on handover** | On *Ready for Pickup*: customer name, hour meter out and signature drawn on the phone/tablet. Confirming closes the job and updates the machine's hour meter. A job cannot be closed without it. | Supervisor, Boss |
| 6 | **Today's plan** | Dashboard panel: each crew member with a job picker for today. Planning someone onto a job adds them to the job team. Mechanics see "Your plan today". | Set by Supervisor, Boss |
| 7 | **Bay status** | Dashboard "Workshop floor": Bay 1–5, fabrication bay, paint bay, long-stay yards A/B and field jobs, each showing machine, job, status and lead. Free bays are marked. The New Job form shows which bays are in use. | Everyone |
| 8 | **Days in status** | Every job card and the jobs list show "4 d in Awaiting Parts". Amber/red when a job sits too long (Received 1/2 days, In Progress 7/14 days, others 3/7 days). Stuck jobs go to *Needs attention*. | Everyone |
| 9 | **Purchase orders** | *Create purchase order* pre-fills parts below minimum and not already on order, picks the cheapest supplier per line, and raises one PO per supplier. POs over **RM 5,000** raised by the Supervisor wait for Boss approval. *Receive goods* (full or partial) adds stock, reduces on-order and updates the purchase price. Late POs are flagged. | Supervisor, Boss |
| 10 | **Stock movement history** | Every receive, issue and stock-take adjustment is logged with date, quantity, reference (job or PO) and person. Viewable per part or for all parts. | Supervisor, Boss (mechanics see stock levels only) |
| 11 | **Supplier price comparison** | Each part keeps the last quoted price from every supplier. Part page shows them side by side with the lowest marked; the stock list hints when another supplier is cheaper. | Supervisor, Boss |
| 12 | **Machine QR label** | Each machine page shows a printable QR sticker (model, serial, owner). Scanning it in the app opens the machine's history, open jobs and parts list. | Everyone |
| 15 | **Weekly schedule** | Team page grid: one row per crew member, Mon–Sat, job or leave per day, with week navigation. Today's column feeds the dashboard plan. | Edit: Supervisor, Boss. Mechanics see their own row |
| 16 | **Comebacks per mechanic** | A warranty/comeback job links to the original job; the comeback is counted against the original lead mechanic on the team card, profile and productivity report. | Boss only |
| 17 | **Monthly reports** | Revenue, parts cost, labour cost and gross margin by job category; revenue by month; margin % trend; crew utilisation (billable vs clocked hours), jobs closed and comebacks. | Boss only |
| 18 | **Daily 6 pm summary** | WhatsApp (or email) to the Boss every day: jobs closed, new jobs, emergencies, jobs by stage, overdue, parts issued value, POs raised and waiting approval, crew on jobs, top items needing attention. | Boss |

Status rules added by these features:

- *Quality Check → Ready for Pickup* requires the full QC checklist.
- *Ready for Pickup → Closed* requires the customer handover and signature.
- Moving a job to a new status resets its "days in status" counter.

### Service reports

**Job service report** (button on every job, Boss and Supervisor):

- Report no. `SR-YYYY-NNNN`, matching the job number. Marked **Interim** while the job is open and **Final** once closed.
- Contents: customer, machine (model, serial, hour meter in/out), job details and technicians, customer complaint, findings, work carried out, parts used, labour hours, photos grouped before / during / after, QC checklist results, recommendations, and signatures (serviced by, customer acceptance with the signature captured at handover).
- Options: include selling prices or not (cost prices and margins never appear), include photos, include QC checklist.
- Recommendations are pre-filled (next service due from the hour meter, outstanding tasks, care advice by job type) and can be edited before sending.
- Sent as a PDF on the company letterhead by WhatsApp or email. Each send is logged on the job.

**Machine service history report** (button on every machine page, Boss and Supervisor):

- For long-stay machines and fleet owners: every job on the machine for the last 12 months or all records.
- Summary: number of jobs by type, labour hours, days off work, amount billed (optional).
- Table of jobs with date, job no., type, hour meter, complaint and work done, days off work.
- Next scheduled service.

---

## 12. Languages

The app runs in **English, Bahasa Melayu and 中文**, with more languages added as one translation file each.

| What | How |
|---|---|
| Staff | Each person chooses a language from the top bar or sign-in page; it is saved on their account. |
| Customer reports | Each customer has a report language; service and machine history reports print in it and can be switched before printing. |
| Translated | Menus, buttons, statuses, job categories, roles, QC checklist, error messages, activity history. |
| Not translated | Free text people type: complaints, diagnosis, notes, task names, machine specs. |
| Suggested next | Tamil, Bengali or Nepali for foreign workers; optional machine translation of typed notes. |

---

## 13. Supplier prices that change often (built in Phase 2)

| Situation | What happens |
|---|---|
| Supplier quotes a new price by phone or WhatsApp | Record it on the part page. It is added to that supplier's price history with the date; old prices stay. |
| A new price is typed on a purchase order | Saved to the history when the PO is raised. A change of more than 10% from that supplier's last price shows a warning first. |
| Buying from a new supplier | Choose "+ New supplier" on the PO line, enter name, phone, terms and lead time. The supplier and their price are saved without leaving the PO. |
| The invoice price differs from the PO | Enter the invoice price when receiving. Stock is costed at the invoice price, the price is saved to the history, and the Boss is alerted. |
| Supplier sends a new price list | Save it as CSV and import it. Matched prices are added to the history; unmatched rows and changes over 10% are listed. |
| Stock cost | Weighted average: (stock × old average + received × new price) ÷ new stock. Used for stock value and job parts cost. |
| Selling price | Category markup on average cost (follows cost automatically), or a fixed price with a margin alert to the Boss. |

## 14. In-app chat

| Chat | Who can read it |
|---|---|
| Job chat (one per job) | Job lead and team, Supervisor, Boss |
| Workshop | All staff |
| Private message | Only the two people (not the Boss) |

- Text up to 2,000 characters and photos (same types and 10 MB limit as job photos). Photos are served only to people who can read the chat.
- Live updates by polling every 4 seconds while the screen is open (no extra server needed). Unread counts are kept per person per chat.
- Job notes and the activity history stay the formal record; chat is for quick talk. Prices should not be posted in chats mechanics can read, and the app reminds people who see prices.
- Later options: push notifications on phones, WhatsApp bridge (Phase 5).

## 15. Simpler machines and jobs (October 2026, after go-live)

Changes asked for by the Head Manager after first use:

- **One-page new job.** New job lets you pick a machine already in the system (search by plate, serial, model or company) or enter a **new machine** on the same page. A new **company** can be added in place too. The model library fills itself: a new make + model is added automatically.
- **Machines are identified by plate number.** Machines without a plate use the serial / chassis number. At least one is required, and a plate can only belong to one machine (stored upper case, e.g. `WXY 1234`).
- **Machine types**, grouped: Mobile crane (Truck, Rough Terrain, All Terrain), Cranes & lifting (Crawler crane, Lorry crane, Skylift, Scissor lift, Forklift), Lorries & vehicles (Lorry, Cargo lorry, Low loader, Prime mover, Car), Equipment & others (Generator, Air compressor, Excavator, Wheel loader, Other). The machine list filters by type or group.
- **Component models** on each machine: engine model, transmission model, hydraulic pump model (optional).
- **Machine photo** as a profile picture, shown in the machine list and on the machine page.
- **"Owner" / "Customer" is now "Company"** everywhere it means the company that owns the machine.
- **Five job stages:** Received → In Progress → Waiting Parts → Quality Check → Ready (then Closed after handover). Diagnosing and Awaiting Approval were removed; existing jobs moved to In Progress and Received. Crew can move their own job between In Progress, Waiting Parts and Quality Check.
- **Dashboard:** the value of open jobs is shown to the Head Manager only.

## 16. Settings (Head Manager only)

A **Settings** tab, visible only to the Head Manager, makes the fixed lists editable in the app:

| Section | What can be changed |
|---|---|
| Workshop details & rates | Company name, address, phone and SSM no. printed on reports and POs; labour charge per hour; PO approval limit |
| Job categories | Add, rename, colour, default priority, hide, reorder |
| Machine types | Add (into a group or a new group), rename, move between groups, hide, reorder |
| Bays & work areas | Add, rename, hide, reorder |
| Quality check list | Add, rename, hide, reorder (applies to new jobs) |

How it works: the built-in entries stay in code (`src/lib/lists.ts`) and keep their translations; changes and new entries are stored in `list_items` / `app_settings` and merged on top. Renamed entries show the typed name in every language; leaving a built-in name unchanged keeps it translated. Hidden entries disappear from drop-downs but old records keep them. The server loads the lists at start-up (`src/instrumentation.ts`) and reloads after every change; the app layout passes them to the browser. Job categories are now stored as text so new ones can be added. The model library can also be edited (make, model, type, specs, service intervals).

## 17. Job layout and locations (after first use)

- **Where is the machine?** One list on New job and Edit job: the workshop bays and areas (now including **Open yard**; Bay 5 removed) or **Outside job**, which asks for the site address instead of a bay. The Head Manager can change the list in Settings.
- **Edit job** button at the top of every open job (Head Manager and Supervisor): category, priority, due date, location, hour meter, reported by and complaint, on its own page.
- **Before photos** can be added on the New job form. Photos are shrunk on the phone before upload (max 1920 px JPEG) so they send quickly on mobile data.
- **Jobs in boxes**: the Jobs page shows one box per job, newest first, with its before photo (or the machine photo), plate number, company, category, stage, due date and lead. The table view is one tap away.
- **Dashboard bays** show the plate number, or make and model when there is no plate.

## 18. Quality checks per job, and parts bought for a job

- **Quality checks are chosen per job.** New jobs start with no checks. On the job page anyone on the job can add a check (type it, or pick from the suggestions); "Add standard checks" adds all suggestions at once. The Head Manager and Supervisor can remove a check that is not ticked. Settings → *Quality check suggestions* holds the suggestion list. A machine is released only when the job has at least one check and all are ticked.
- **Parts on a job come in two kinds:**
  - *From our stock*: requested by the crew or issued by the Supervisor from any stock part (parts that fit the machine are listed first). Stock and average cost update as before.
  - *Bought for this job*: parts bought from a supplier for this job only (not stock): description, part no., supplier, quantity, cost, selling price (blank = cost + markup set in Settings, default 25%), invoice no. and date. Head Manager and Supervisor only; mechanics see the lines without prices.
- Both kinds count in the job value, gross margin, dashboard value of open jobs and the customer's service report.

## 19. Four job stages and the job report

- **Stages:** Received → In Progress → Pending Parts → **Completed**. Quality Check and Ready are no longer stages (existing jobs moved: Quality Check → In Progress, Ready → Completed). Crew move their jobs between In Progress and Pending Parts; the Head Manager or Supervisor marks a job Completed once every task is done and every quality check on the job is ticked. Checks can be ticked any time before completion.
- **Customer handover** (name, hour meter, signature) is recorded after the job is Completed, when the customer collects.
- **Job report** on every job: customer complaint, diagnosis / findings, **work carried out**, **recommendations to the customer** (both printed on the service report) and **follow-up / status remarks** with a follow-up date (internal). Follow-ups that are due appear in the dashboard's attention list until the remark is cleared.
- **Completed jobs can be edited** by the Head Manager and Supervisor (Edit job and the job report) and **reopened** (back to In Progress) if more work is needed.

## 20. Jobs logged before they are planned

- The **target date is optional** (New job and Edit job). Jobs without one show "No due date", are never overdue, and sort after dated jobs.
- The location list starts with **"Not decided yet"** (now the default on New job; emergencies default to Outside job). Lead already defaults to "Assign later".
- So a job can be logged with just the machine and the complaint. It sits in **Received** until someone decides when and where; then Edit job fills in the date, bay and lead, and the job moves to In Progress when work starts.

## 21. Machine service schedule and optional hour meter

Many machines have no working hour meter, so the hour meter is **optional** everywhere: at handover after a job is
completed, when adding a machine and on the job report. An empty reading shows as "—".

Servicing is tracked **by date** per machine (`machine_services`, one row per machine and service item):
last done, interval in months, next due (calculated from last done + interval, or typed in), notes and the job that did it.

- **Service items** are an editable list (Settings → Service items), each with a default interval: engine oil & filter
  (3 months), hydraulic oil, transmission oil, differential gear oil, swing gear oil (12), greasing (1), air-con, brakes,
  fuel filter, air filter, wire rope (6), coolant (24). The Head Manager can rename, hide, reorder or add items.
- **Machine page → Service schedule**: add the standard items in one tap, add or update any item, "Done today",
  remove. Each row shows a due pill: overdue, due within 14 days, OK, or no date yet.
- **Job page → Services done on this job**: tick the items serviced and the date; the machine's schedule moves on
  (next due = date + interval) and the job is recorded against it.
  The section shows only on **service jobs** (categories ticked "Service job" in Settings; built-in: Preventive
  Maintenance and Hydraulic Service), on any job whose machine has a service overdue or due within 14 days, and on a job
  that already recorded a service. Other jobs (breakdowns, repairs) stay clean.
- **Dashboard** attention list shows services overdue or due within 14 days; the **Machinery list** shows each
  machine's next service.
- Managing the schedule needs `machine.manage` (Head Manager, Supervisor); recording on a job is open to anyone
  working the job. No prices are involved.

## 22. Correcting labour time

Each labour line on a job has an **Edit** button: change date, hours and note (and the person, for supervisors), or
remove the line. Supervisors and the Head Manager can change any line, also on completed jobs; crew can change only their
own time while the job is open. Every change is written to the job's activity log (old and new hours, who changed it).

## 23. Today dashboard (Head Manager, Supervisor)

Built around the Supervisor's three questions: what is being worked on, what is stuck or left hanging, and what
servicing is coming up.

- **Summary counts** (tap to jump): working now, waiting for parts, not started, services due (14 days), crew free.
  The Head Manager also sees the value of open jobs.
- **Act now**: emergencies with no mechanic, overdue jobs, jobs stuck too long, open part requests, purchase orders
  to approve or late. Five shown, the rest behind "Show all".
- **Working today**: In Progress jobs, one line each: plate, job type, where, who, task progress, due.
- **Waiting for parts**: days waiting and open part requests.
- **Not started yet / on hold**: Received jobs, oldest first, with days waiting (amber from 5 days, red from 14).
- Side column: **Services coming up** (overdue / 14 days / 30 days), **Crew today** (free first), **Bays & yard**
  (compact), **Other reminders** folded (certificates, long-stay machines, follow-ups, stock and price alerts).

The job board moved off the dashboard (it is on the Jobs page). Crew keep their own "My jobs" view.
