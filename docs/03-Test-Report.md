# Test Plan & Report: CampusConnect

## 1. Strategy

| Level | Tool | What it covers | How to run |
|---|---|---|---|
| Unit | Vitest | Pure business rules in `lib/services/*` (no database, no browser) | `npm test` |
| End-to-end | Playwright (Chromium) | Real user flows through the UI, against a freshly seeded Supabase database | `npm run test:e2e` |
| Accessibility | axe-core in Playwright | WCAG 2 A/AA rules on the key screens (fails on *serious*/*critical*) | part of `test:e2e` |
| Responsive | Playwright at 360 × 740 | No horizontal page scroll; student bottom tab bar visible | part of `test:e2e` |
| Static | TypeScript, ESLint | Type safety, code quality | `npm run typecheck`, `npm run lint` |
| Exploratory audit | `scripts/qa-audit.mjs` | Every page of every role at 360 px + axe report (`DARK=1` for the dark theme) | `npm run qa:audit` |
| OCR on real files | `scripts/ocr-check.mjs` | Renders a printed-style timetable to PNG and PDF, uploads both through the real page, reports what was read | `npm run qa:ocr` |

**Test data:** `npm run seed` creates a deterministic dataset for BMSIT&M. It has 7 departments, CSE with 4 clusters and 8 sections, 38 staff and 40 students, published timetables, two teachers on leave today, a holiday next week, 8 complaints covering every status (one confidential, one SLA-overdue) and 6 announcements. End-to-end runs re-seed before starting, so every run begins from the same state.

**Time-dependent behaviour** is tested with a fixed instant: unit tests pass `at`, and end-to-end tests set the demo "Simulate time" cookie.

## 2. Unit tests: 66 tests, all passing

### Availability engine (`tests/unit/availability.test.ts`): 21 tests
| # | Case | Requirement |
|---|---|---|
| 1 | Active leave wins over everything and never exposes a reason | FR-15, FR-20 |
| 2 | Half-day leave ending mid-day shows the return time, then normal status resumes | FR-16, FR-18 |
| 3 | Cancelled leave is ignored | FR-20 |
| 4 | Back-to-back leaves are merged for the "Back on" date | FR-16 |
| 5 | Holiday | FR-15 |
| 6 | Outside college hours | FR-15 |
| 7 | Sunday and 2nd/4th Saturday are non-working days | FR-8 |
| 8 | A cancelled class makes the teacher free | FR-21 |
| 9 | An extra class puts the teacher in class | FR-21 |
| 10 | In class shows subject, section, room and end time | FR-16 |
| 11 | A lab spanning P3–P4 is in class until the end of P4 | FR-9 |
| 12 | A lab spanning a break keeps the teacher in class during the break | FR-9 |
| 13 | A break between two separate classes is free time | FR-15 |
| 14 | Free period, meetings on → Available until next class | FR-15 |
| 15 | No more classes today → "Free for the rest of the day" | FR-16 |
| 16 | Free period, meetings off → Busy | FR-15 |
| 17 | The meeting toggle cannot override In Class, Leave, Holiday or Off hours | FR-17 |
| 18 | No published timetable (and leave still takes priority) | FR-15 |
| 19 | A lab is split around a single cancelled period | FR-21 |
| 20 | Next class is found on a later day, skipping a holiday | FR-23 |
| 21 | Classes inside leave are skipped when finding the next class | FR-23 |

### Complaints (`tests/unit/complaints.test.ts`): 22 tests
| Group | Cases | Requirement |
|---|---|---|
| Routing (9) | teacher → teacher's CH · CH accused → HOD · HOD accused → Admin · academic → student's CH · department → HOD · facility & college → Admin · confidential (category or toggle) → HOD · vacant office falls back · teacher required · escalation CH → HOD → Admin skipping an accused HOD | FR-26 |
| Workflow (8) | assignee actions · requested teacher can only respond · no response on confidential · reopen once within 7 days · auto-close after 7 days · auto-escalate only un-acted CH complaints · action → status map · SLA chip states | FR-28 to FR-32 |
| SLA maths (1) | skips Sunday, the 4th Saturday and holidays | FR-31 |
| Access & masking (4) | student A cannot see student B's complaint · accused teacher only when requested and never if confidential · CH sees cluster complaints but not confidential ones or ones about themselves · masking below HOD, and the requested teacher never sees the student | FR-30, FR-33, NFR-2 |

### Timetable, OCR, announcements (`tests/unit/timetable-ocr-announcements.test.ts`): 11 tests
Includes OCR misread correction: look-alike codes snap to a known code only when unambiguous; `58`→`5B`; lab rooms; corrected cells stay flagged for review.
| Case | Requirement |
|---|---|
| Overlapping entries for the same teacher are blocked | FR-12 |
| Room and section clashes with other teachers are warnings, not blocks | FR-12 |
| Sections are required for classes; unreviewed OCR cells block publishing | FR-12, FR-14 |
| A meeting needs no section; summary counts | FR-13 |
| OCR cell parsing (code, section, room, LAB) | FR-14 |
| OCR words mapped to day × period cells; lab span merged; low confidence flagged | FR-14 |
| OCR reports when no day names are found | FR-14 |
| Announcement targeting by scope, audience, semester and section | FR-37 |
| Expired announcements hidden | FR-37 |

### Access rules (`tests/unit/roles.test.ts`): 12 tests
Route access for every role, segment-safe prefix matching, shared pages, public pages, role validation, open-redirect protection for `?next=`, initials and navigation highlighting (FR-5, FR-6, NFR-1).

## 3. End-to-end tests: 12 tests, all passing

| # | Scenario | Acceptance item / requirement |
|---|---|---|
| E1 | Student finds a teacher, sees a live status chip, cabin and weekly timetable | FR-22, FR-23 |
| E2 | Teacher marks unavailability → student sees **On Leave**, the private reason is never shown → Cluster Head gets a notification | Checklist 2 · FR-18 to FR-20 |
| E3 | Teacher turns meetings off → student sees **Busy** in a free period, and still **In Class** during a class | Checklist 3 · FR-17 |
| E4 | Student files an academic complaint → "This will go to: Dr. Rajesh Sharma, Cluster Head – Cluster 2", ID `CMP-2026-xxxx` → CH resolves → student sees the resolution | Checklist 4 · FR-25 to FR-27 |
| E5 | Full lifecycle: CH requests a teacher response → teacher replies (student identity withheld) → CH resolves → student reopens → CH escalates → HOD sees it and resolves → student closes. Every step is on the timeline | Checklist 7 · FR-29 to FR-34 |
| E6 | Admin runs the SLA job → the overdue `CMP-2026-0008` auto-escalates to the HOD | Checklist 8 · FR-31 |
| E7 | A Cluster Head opening a confidential complaint gets **HTTP 403**; the HOD sees it with the real identity | Checklist 6 · FR-33 |
| E8 | Student A opening Student B's complaint URL gets **HTTP 403** | Checklist 9 · NFR-2 |
| E9–E11 | axe accessibility on student, teacher and HOD key pages: 0 serious/critical violations | NFR-4 |
| E12 | 360 px phone: student pages don't scroll sideways; bottom tab bar is visible | NFR-5 |

Checklist items 1 (publish → "In Class · Room 204") and 5 (complaint against a CH → HOD) are covered by unit tests (#10, routing) and demonstrated manually in the demo script. Item 1 is also exercised by E3, which reads the published timetable's In Class status.

## 4. Requirement traceability (summary)

| Requirement group | Unit | E2E | Manual demo |
|---|---|---|---|
| Accounts & access (FR-1 to FR-7) | ✔ roles | ✔ E7, E8 | sign-up for a vacant CH seat; rejected for a filled seat |
| Timetable (FR-8 to FR-14) | ✔ validation, OCR | via E3 | edit, publish summary, scan upload review |
| Availability (FR-15 to FR-24) | ✔ 21 cases | ✔ E1, E2, E3 | Simulate time across the day |
| Complaints (FR-25 to FR-35) | ✔ 22 cases | ✔ E4 to E8 | evidence upload, 3-per-day limit |
| Notifications & notices (FR-36, FR-37) | ✔ targeting | ✔ E2 (CH bell) | live bell toast, notice unread dot |
| Admin & reports (FR-38 to FR-43) | n/a | ✔ E6 | structure tree, CSV import preview, charts |
| Non-functional (NFR-1 to NFR-9) | ✔ access | ✔ E7 to E12 | dark mode, keyboard-only editor |

## 5. Defects found during testing (and fixed)

| ID | Found by | Defect | Fix |
|---|---|---|---|
| D1 | Build (static) | Protected pages were pre-rendered at build time without Supabase keys, freezing a redirect | Session helper forces per-request rendering |
| D2 | E2E | Every profile had role STUDENT: the auth admin API writes `app_metadata` *after* inserting the user, so the insert trigger saw only the default | Migration `…006_role_sync_fix`: sync on update in both directions plus a one-time repair |
| D3 | E2E | Find a Teacher was empty for students (a consequence of D2) | Fixed by D2 |
| D4 | Browser check | Inter font not applied (font variable set on `<body>`, font applied on `<html>`) | Variables moved to `<html>` |
| D5 | axe | Five issues: contrast of finished classes, a white-on-light button, unreachable scroll regions, invalid ARIA grid roles, a focusable hidden chart layer | Fixed. Re-audit shows 0 serious/critical |
| D6 | 360 px audit | Login page scrolled sideways (truncated text widening the grid); card titles truncated | `grid-cols-1` / `min-w-0`; wrapping card headers |
| D7 | Console probe | Effect returned `scrollIntoView()`'s Promise; the chat also scrolled the whole page on phones | Scroll only the message list |
| D8 | E2E | Streaming `loading.tsx` turned the complaint 403 into a 200 | Loading skeletons scoped away from the complaint detail route |
| D9 | Browser | Extension-injected attributes and wallet errors flooded the console / dev overlay | `components/extension-guard.tsx` |
| D10 | E2E (E3) | The "Accepting meetings" switch never saved: the upsert also rewrote `teacher_id`, a column teachers are deliberately not allowed to update, so Postgres returned *permission denied* and the switch reverted | Action now updates the teacher's own row and inserts only when none exists. Column grants stay strict |
| D11 | Real-file OCR check (`npm run qa:ocr`) | On a real printed timetable, OCR at the uploaded resolution missed the day labels and period headers. Only 1 of 12 subject codes was correct (`21CS53` read as `210853`), and the title text leaked into cells | Uploads are normalised to about 2,500 px and greyscale. Tesseract runs in sparse-text mode with an auto-layout fallback. The parser snaps look-alike misreads to known codes (flagged for review), fixes `58`→`5B` and recognises lab rooms. Result: **12/12 classes read correctly from both PNG and PDF** |
| D12 | axe in dark mode (`DARK=1 npm run qa:audit`) | Dark-mode contrast failures: white hero buttons with light-blue text (2.3:1), maroon text (3.4:1), white text on red and blue status badges (2.8:1) | Dedicated dark "maroon ink" token, dark text on bright dark-mode status fills, primary-styled hero buttons. Dark and light both 0 serious/critical |

## 6. Latest results

| Suite | Result |
|---|---|
| Unit (Vitest) | **66 / 66 passed** |
| OCR on real files (PNG + PDF of a printed timetable) | **12 / 12** classes read with correct code, section and room; 0 flagged |
| End-to-end (Playwright, Chromium) | **12 / 12 passed** against a freshly seeded database |
| axe (all pages, all roles, 360 px, light **and** dark theme) | **0** serious/critical violations |
| Horizontal overflow at 360 px | **none** |
| TypeScript / ESLint | **0 errors** |
