# Project Management & Viva Guide: CampusConnect

## 1. Process model

**Incremental model** with nine increments. Each delivered a working, testable slice and was reviewed before the next started:

| # | Increment | Delivered |
|---|---|---|
| 1 | Foundation | Project setup, design tokens, layout shell, auth, role route groups, middleware, demo login |
| 2 | Structure & users | Migrations + RLS, departments/clusters/sections, admin tree, verification, CSV import, seed |
| 3 | Timetable | Period slots, grid editor, versioning & publish, conflict validation, today/next view |
| 4 | Availability | Availability engine + tests, unavailability, meeting toggle, overrides, holidays, Find a Teacher, Simulate time |
| 5 | Complaints | Wizard, routing + tests, detail/timeline/thread, handler actions, response requests, escalation, SLA job, reopen/close, masking |
| 6 | Notifications & announcements | Realtime bell, notifications page, scoped notices |
| 7 | Dashboards & reports | CH/HOD/Admin KPIs, charts, audit log |
| 8 | OCR upload | Tesseract.js extraction → review → publish |
| 9 | Polish & QA | Loading/empty/error states, mobile + accessibility pass, Playwright, documentation |

**Why incremental?** The requirements were clear up front, but the flagship modules (availability, complaints) carried the most risk. Building them as separate increments let each be demonstrated and tested on its own, and kept the product demo-able at every stage.

## 2. Risk register

| Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|
| OCR misreads timetables | High | Medium | OCR only creates a draft; low-confidence cells are highlighted and publishing is blocked until they are confirmed; the manual editor is the primary input | Mitigated |
| Data leak between roles | Medium | High | Three layers: middleware, server checks, RLS. Unit and E2E tests for 403s and masking | Mitigated |
| Wrong status because of time zones | Medium | High | All logic in IST via date-fns-tz; the engine takes the instant as a parameter; tests use fixed instants | Mitigated |
| Two people claim the same HOD/CH seat | Low | Medium | Unique constraints plus an atomic `UPDATE … WHERE head IS NULL` | Mitigated |
| Abuse of anonymous complaints | Medium | Medium | Confidential ≠ anonymous (still linked internally); 3 per day; evidence limits | Mitigated |
| Live demo depends on the time of day | High | Medium | "Simulate time" control and preset times | Mitigated |
| Free-tier limits (Vercel cron, Supabase) | Medium | Low | Daily cron plus a "Run SLA job now" button; light queries and indexes | Accepted |
| Secrets shared during development | Medium | High | Rotate the DB password and service-role key before deployment | **Action required** |

## 3. Demo script (≈ 12 minutes)

Before starting: `npm run seed`, then `npm run dev`, then open the login page. Use an incognito window so browser extensions don't interfere.

| Min | Step | What to say |
|---|---|---|
| 0–1 | Login page → demo accounts, **Create account** → show a filled HOD seat greyed out | "Five roles. Each department has one HOD and each cluster one Cluster Head, enforced by the database." |
| 1–3 | **Student** home → today's classes, *My teachers right now*, section timetable. **Find a Teacher** → filter, open Prof. Kavitha Rao | "Status is computed live from the published timetable." |
| 3–4 | Header **Simulate time** → *Mon 9:30 AM* → In Class; *Mon 10:55* → break; *Mon 6:00 PM* → Off Campus Hours | "The priority order is the core algorithm, with 21 unit tests." |
| 4–6 | **Teacher** → Timetable editor: drag a lab, conflict panel, Publish summary. Mark Unavailability → Half day FN | "Students see On Leave instantly; the reason stays private." |
| 6–9 | **Student** → Raise complaint → *Against a teacher*: the "This will go to" box → submit → copy ID. **Cluster Head** → Request teacher response → **Arjun Menon** replies → CH resolves | "Routing is a pure function; the teacher can respond but never change the status." |
| 9–10 | **Student** reopens → **CH** escalates → **HOD** resolves → student closes. Show the timeline | "Every step is immutable in the timeline." |
| 10–11 | **HOD** dashboard: KPIs, cluster chart, leave panel with private reasons. Open the confidential complaint; then as CH → 403 | "Confidential identity is masked below HOD; the accused never sees it." |
| 11–12 | **Admin**: structure tree, CSV import preview, period slots, **Run SLA job** → CMP-2026-0008 escalates; audit log | "Scheduled jobs run daily on Vercel Cron, or on demand." |

## 4. Likely viva questions

**Q1. Why compute availability on read instead of storing a status?**
Status depends on the current instant. A stored status would need a background job every minute and could be stale. Computing it from the timetable, leaves, overrides and holidays is always correct, works with simulated time, and is a pure function that is easy to test.

**Q2. Explain the availability priority order.**
Leave → holiday → off hours → overrides → in class → available/busy → not published (`lib/services/availability.ts`). The meeting toggle is consulted last, so it can't override a class or leave.

**Q3. How do you stop a student reading another student's complaint?**
Three layers. Middleware limits routes by role. The page loads the complaint with the *user's* Supabase client, so the RLS policy `can_view_complaint()` returns nothing, and the page then sends **403** if the complaint exists. The same rule exists in TypeScript (`complaintAccess.ts`) and is unit-tested. E2E test E8 proves the 403.

**Q4. How are internal notes hidden from students?**
Each message has an `audience`. The RLS policy on `complaint_messages` returns only `PUBLIC` messages to the student, so internal notes never reach their browser at all. It is not just hidden in the UI.

**Q5. How does SLA auto-escalation work?**
On assignment, `sla_due_at` = now + 5 *working* days (skipping Sundays, off-Saturdays and holidays). `/api/cron/jobs` (Vercel Cron, secured with `CRON_SECRET`) finds Cluster Head complaints still in ASSIGNED/ESCALATED/REOPENED past their due time, escalates them to the HOD, writes `AUTO_ESCALATED` to the timeline and notifies everyone involved.

**Q6. What if two teachers try to become HOD of CSE at the same time?**
`departments.hod_id` is `UNIQUE`, and sign-up claims the seat with `UPDATE departments SET hod_id = … WHERE id = … AND hod_id IS NULL`. Only one update can succeed; the other account is rolled back with "already has an HOD".

**Q7. Why Supabase and RLS rather than only checking in the API?**
The anon key is public, so anyone could call the database API directly. RLS makes the database itself enforce the rules. Server checks give friendly errors and run the workflow rules.

**Q8. How does OCR work and why can't it publish directly?**
Tesseract.js runs in the browser and returns words with bounding boxes and confidence. `ocrParser.ts` finds day rows and period columns, assigns words to cells, extracts code, section and room, and merges lab spans. Cells with low confidence or missing fields are flagged, and publish validation blocks until every flagged cell is confirmed.

**Q9. How do you handle time zones?**
Everything is computed in Asia/Kolkata using `date-fns-tz`. Instants are stored as `timestamptz`, wall-clock times are converted with `istDateTime()`, and tests use fixed instants.

**Q10. What does "confidential" guarantee?**
The complaint goes straight to the HOD. It is invisible to Cluster Heads and teachers (RLS), the student is shown as "Confidential Student" to anyone below HOD, and the accused teacher can never be asked to respond. It is *not* anonymous: the database keeps the link for accountability.

**Q11. How did testing find real bugs?**
E2E tests showed staff being refused their own pages. The cause was that Supabase's admin API sets `app_metadata` after inserting the user, so the profile trigger saw the default role. A migration now syncs roles in both directions (defect D2 in the test report).

**Q12. How does the app stay live without refreshing?**
Supabase Realtime pushes changes to `notifications`, availability tables and complaint messages. Clients subscribe and re-render; RLS also applies to Realtime, so users only receive rows they may see.

**Q13. Limitations and future work?**
Email is stubbed behind an interface. Hobby-tier cron is daily. OCR quality depends on photo quality. Possible extensions: attendance, a mobile app (PWA), SMS alerts, analytics on complaint trends, SSO with the college Google Workspace.

## 5. Code tour (where to point during the viva)

| Topic | File |
|---|---|
| Availability algorithm | `lib/services/availability.ts` · tests `tests/unit/availability.test.ts` |
| Complaint routing | `lib/services/complaintRouting.ts` |
| Complaint state machine | `lib/services/complaintWorkflow.ts` |
| Access & masking | `lib/services/complaintAccess.ts` · SQL `can_view_complaint` in `supabase/migrations/…004_complaints.sql` |
| Role gate | `middleware.ts`, `lib/supabase/middleware.ts`, `lib/auth/roles.ts`, `lib/auth/session.ts` |
| Sign-up with one head per unit | `lib/auth/actions.ts` (`signupAction`) |
| SLA job | `lib/server/jobs.ts`, `app/api/cron/jobs/route.ts`, `vercel.json` |
| Timetable editor | `components/teacher/timetable-editor.tsx`, `lib/actions/timetable.ts` |
| OCR | `components/teacher/ocr-upload.tsx`, `lib/services/ocrParser.ts` |
| Database schema | `supabase/migrations/*.sql` |
