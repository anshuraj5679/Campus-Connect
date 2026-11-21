# Design Document: CampusConnect

## 1. Architecture

```mermaid
flowchart LR
  subgraph Client["Browser"]
    RSC["React Server Components<br/>(rendered on server)"]
    CC["Client Components<br/>forms · editor · bell · live refresh"]
    OCR["Tesseract.js + pdf.js"]
  end
  subgraph Server["Next.js on Vercel"]
    MW["middleware.ts<br/>session refresh + route→role gate"]
    PAGES["Route groups<br/>(student)(teacher)(cluster-head)(hod)(admin)(shared)"]
    ACT["Server Actions<br/>lib/actions/*"]
    DATA["Data loaders<br/>lib/data/*"]
    SVC["Pure business rules<br/>lib/services/*"]
    JOB["/api/cron/jobs"]
  end
  subgraph Supa["Supabase"]
    AUTH[(Auth)]
    PG[(Postgres + RLS)]
    STO[(Storage)]
    RT((Realtime))
  end
  CC -->|form submit| ACT --> SVC
  ACT --> PG & STO
  PAGES --> DATA --> PG
  DATA --> SVC
  MW --> AUTH
  JOB --> SVC
  JOB --> PG
  PG -. changes .-> RT -. push .-> CC
  OCR -. draft entries .-> CC
```

**Layering rule:** UI components never contain business rules. Pages call `lib/data/*`, which fetches rows and calls the pure functions in `lib/services/*`. Mutations go through `lib/actions/*`, which authenticate, validate with zod, check workflow rules, then write. The same rules are mirrored in SQL (RLS helper functions) so the database enforces them even if application code has a bug.

### Folder map
| Folder | Responsibility |
|---|---|
| `app/(auth)` | login, sign-up |
| `app/(student)`, `(teacher)`, `(cluster-head)`, `(hod)`, `(admin)` | role areas. Each layout calls `requireRole()` |
| `app/(shared)` | find a teacher, teacher profile, complaint detail, notices, notifications, account |
| `lib/services` | availability engine, routing, workflow, access, validation, OCR parser, targeting, time |
| `lib/data` | server-only loaders (viewer, calendar, availability, complaints, …) |
| `lib/actions` | server actions (auth, timetable, availability, complaints, announcements, admin, demo) |
| `lib/server` | notify (+ email stub), audit, scheduled jobs, action helpers |
| `supabase/migrations` | schema, RLS, triggers, storage, realtime |
| `tests/unit`, `tests/e2e` | Vitest, Playwright |

## 2. Data model (ER diagram)

```mermaid
erDiagram
  profiles ||--o| student_profiles : "is"
  profiles ||--o| teacher_profiles : "is"
  departments ||--o{ clusters : has
  departments |o--o| profiles : "HOD (hod_id, unique)"
  clusters |o--o| profiles : "Cluster Head (cluster_head_id, unique)"
  clusters ||--o{ sections : owns
  sections ||--o{ student_profiles : "enrols"
  clusters ||--o{ teacher_profiles : "groups"
  profiles ||--o{ timetable_versions : "teacher"
  timetable_versions ||--o{ timetable_entries : contains
  sections ||--o{ timetable_entries : "taught to"
  profiles ||--o{ teacher_unavailability : marks
  profiles ||--o| availability_preferences : sets
  profiles ||--o{ schedule_overrides : makes
  profiles ||--o{ complaints : "raises (student)"
  profiles ||--o{ complaints : "about (teacher)"
  profiles ||--o{ complaints : "assigned to"
  complaints ||--o{ complaint_messages : thread
  complaints ||--o{ complaint_attachments : evidence
  complaints ||--o{ complaint_history : timeline
  profiles ||--o{ notifications : receives
  profiles ||--o{ announcements : authors
  announcements ||--o{ announcement_reads : "read by"

  profiles {
    uuid id PK "= auth.users.id"
    text full_name
    text email
    enum role
    bool is_verified
    bool is_active
  }
  departments {
    uuid id PK
    text code UK
    text name
    uuid hod_id FK "UNIQUE"
  }
  clusters {
    uuid id PK
    uuid department_id FK
    text name
    uuid cluster_head_id FK "UNIQUE"
  }
  sections {
    uuid id PK
    uuid department_id FK
    uuid cluster_id FK
    smallint semester
    text name "e.g. 5A"
  }
  student_profiles {
    uuid user_id PK
    text usn UK
    uuid section_id FK
  }
  teacher_profiles {
    uuid user_id PK
    text employee_id UK
    uuid department_id FK
    uuid cluster_id FK
    text cabin_location
  }
  timetable_versions {
    uuid id PK
    uuid teacher_id FK
    enum status "DRAFT, PUBLISHED, ARCHIVED"
    enum source "MANUAL, UPLOAD"
  }
  timetable_entries {
    uuid id PK
    uuid version_id FK
    smallint day_of_week
    smallint start_period
    smallint end_period
    text subject_code
    text room
    enum type
  }
  teacher_unavailability {
    uuid id PK
    uuid teacher_id FK
    enum type
    timestamptz start_at
    timestamptz end_at
    text reason_private "not granted to clients"
  }
  complaints {
    uuid id PK
    text code UK "CMP-2026-0001"
    enum category
    enum status
    bool is_confidential
    uuid current_assignee_id FK
    enum assignee_level
    timestamptz sla_due_at
  }
  complaint_history {
    uuid id PK
    text action
    enum from_status
    enum to_status
    text remark "append-only"
  }
  announcements {
    uuid id PK
    enum scope
    enum audience
    smallint_array semesters
    text_array sections
    bool pinned
    timestamptz expires_at
  }
```

Supporting tables: `college_settings` (single row), `period_slots`, `holidays`, `complaint_counters`, `audit_logs`.

**Key constraints**
- `departments.hod_id` and `clusters.cluster_head_id` are `UNIQUE`, so a person heads at most one unit. Each unit has one head by design.
- Composite FK `(cluster_id, department_id) → clusters(id, department_id)`: a section's or teacher's cluster must belong to the same department.
- Exclusion constraint on `timetable_entries (version_id, day_of_week, int4range(start_period, end_period))`: a teacher can never have two overlapping entries in one version, enforced by the database.
- Partial unique indexes: one `PUBLISHED` and at most one `DRAFT` version per teacher.
- `complaint_history` has a trigger that rejects UPDATE and DELETE (immutable timeline).

## 3. Availability engine

`computeTeacherStatus()` in `lib/services/availability.ts` is a pure function. The first rule that matches wins:

```mermaid
flowchart TD
  A[Instant 'now' in IST] --> L{Active unavailability?}
  L -- yes --> ON[ON LEAVE · 'Back at/on …']
  L -- no --> H{College holiday today?}
  H -- yes --> HO[HOLIDAY · name]
  H -- no --> W{Working day and within college hours?}
  W -- no --> OFF[OFF CAMPUS HOURS]
  W -- yes --> C{Class now? overrides applied: cancelled = free, extra = class}
  C -- yes --> IC[IN CLASS · subject · section · room · until]
  C -- no --> BR{Break inside a lab span?}
  BR -- yes --> IC
  BR -- no --> P{Published timetable?}
  P -- no --> NP[TIMETABLE NOT PUBLISHED]
  P -- yes --> M{Accepting meetings?}
  M -- yes --> AV[AVAILABLE · free until next class]
  M -- no --> BU[BUSY · not accepting meetings]
```

The meeting toggle is consulted only in the last step, so it can never override leave, holiday, off hours or a class (FR-17). The leave *reason* is not an input to the function, so it cannot leak into any status (FR-20).

## 4. Complaint workflow

```mermaid
stateDiagram-v2
  [*] --> SUBMITTED : student submits
  SUBMITTED --> ASSIGNED : routing service
  ASSIGNED --> UNDER_REVIEW : start review / request response / first reply
  ESCALATED --> UNDER_REVIEW
  REOPENED --> UNDER_REVIEW
  UNDER_REVIEW --> ACTION_TAKEN
  ASSIGNED --> ESCALATED : handler escalates · SLA breached (CH level)
  UNDER_REVIEW --> ESCALATED
  ACTION_TAKEN --> ESCALATED
  REOPENED --> ESCALATED
  ASSIGNED --> RESOLVED : resolve (remarks)
  UNDER_REVIEW --> RESOLVED
  ACTION_TAKEN --> RESOLVED
  ESCALATED --> RESOLVED
  REOPENED --> RESOLVED
  RESOLVED --> REOPENED : student, once, ≤ 7 days
  RESOLVED --> CLOSED : student accepts · auto after 7 days
  CLOSED --> [*]
```

`allowedActions(complaint, viewer, now)` in `complaintWorkflow.ts` is the single decision point. The UI renders only the allowed buttons, and every server action re-checks it before writing.

### Sequence: raising a complaint
```mermaid
sequenceDiagram
  actor S as Student
  participant W as Wizard (client)
  participant A as createComplaint (server action)
  participant R as routeComplaint (service)
  participant DB as Postgres
  participant N as notify
  S->>W: category, details, evidence
  W->>A: previewRouting()
  A-->>W: "This will go to: Dr. R. Sharma, Cluster Head – Cluster 2"
  S->>W: Submit
  W->>A: FormData
  A->>A: requireRole(STUDENT) · zod · ≤3/day · files ≤5×5 MB
  A->>R: category, student, teacher, directory
  R-->>A: assignee, level, confidential flag
  A->>DB: next_complaint_code() → CMP-2026-0009
  A->>DB: insert complaint (ASSIGNED, sla_due_at = +5 working days)
  A->>DB: history SUBMITTED, ASSIGNED · upload evidence
  A->>N: notify assignee (Realtime bell)
  A-->>W: code → success screen
```

### Sequence: marking unavailability
```mermaid
sequenceDiagram
  actor T as Teacher
  participant A as markUnavailability
  participant DB as Postgres
  participant N as notify
  actor St as Students (affected sections)
  actor CH as Cluster Head
  T->>A: Half day FN, reason (private)
  A->>A: requireRole(teacher) · zod · convert to IST interval
  A->>DB: insert teacher_unavailability
  A->>DB: published entries overlapping the interval → affected sections
  A->>N: notify students (no reason) and CH
  DB-->>St: Realtime → status refreshes to "On Leave · Back at 12:55 PM"
  N-->>CH: bell: "Prof. K. Rao marked unavailability"
```

## 5. Security model

| Layer | Mechanism | Example |
|---|---|---|
| Edge | `middleware.ts` verifies the JWT and maps route prefix → roles | Student opening `/admin` gets a 403 rewrite |
| Server | `requireRole()` in every layout, page and action, plus zod validation and `allowedActions()` | A teacher cannot call `complaintAction(RESOLVE)` |
| Database | RLS on every table, SECURITY DEFINER helpers that mirror the services, column grants | `complaints` readable only via `can_view_complaint()` |
| Storage | Private buckets; short-lived signed URLs issued after an access check | Evidence links expire after 10 minutes |

Details:
- **Roles** live in `profiles.role` and are synced to the JWT claim `app_metadata.role` by triggers in both directions. Users can't write `app_metadata`, and column grants stop them updating their own role.
- **Messages** carry an audience (`PUBLIC` / `INTERNAL` / `TEACHER`). The RLS policy sends students only `PUBLIC` messages, so internal notes physically never reach a student's browser.
- **The leave reason** is excluded from the column grant. Only the teacher, their CH, their HOD and the Admin can read it.
- **Masking:** confidential complaints are invisible to Cluster Heads and teachers (RLS). For the remaining viewers, `shouldMaskStudent()` replaces the student's identity below HOD level.

## 6. Key design decisions

| Decision | Alternatives considered | Reason |
|---|---|---|
| Pure business-rule modules + SQL mirrors | Rules only in UI, or only in SQL | Testable in milliseconds, explainable, and RLS still protects data if app code is wrong |
| Period-number timetable (P1…P7) | Free-form start/end times | Matches how Indian colleges print timetables. Labs are simple spans |
| Status computed on read | Storing a status column | Always correct for any instant, including simulated time. No background updater needed |
| OCR in the browser | Server-side OCR | Free, no server CPU limits on Vercel, and the image never leaves the user until upload |
| OCR at a normalised ~2,500 px width, sparse-text mode, known-code correction | Raw upload resolution, default layout mode | Measured on a real printed timetable: 1/12 codes correct before, 12/12 after (defect D11) |
| Atomic head-seat claim (`UPDATE … WHERE head IS NULL`) | Check-then-insert | Two simultaneous sign-ups cannot both become HOD |
| Server Actions | Separate REST API | Less code, type-safe, and runs next to the server-side auth checks |
