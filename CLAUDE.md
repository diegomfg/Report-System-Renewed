# Report System — Project Design Document

> Method: Feature → Reasoning → Code → Write → Feedback loop. At the start of every session, read this file, understand the structure, hierarchy and business rules. Then, we continue working on the current issues/tasks. Before implementing any features, a planning session is required, this is to filter out poor planning, ideas or decisions that could change as the project develops. First, always, planning, then, confirmation, then implementation. Process: Feature -> Reasoning (back and forth) -> Code (Written by user or LLM) -> Review

---

## Stack

### Backend
| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | LTS | Runtime |
| Express | 4.x | HTTP server and routing |
| PostgreSQL | 15+ | Relational database |
| Prisma | 5.x | ORM — schema management, migrations, type-safe queries |
| jsonwebtoken | latest | JWT creation and verification |
| bcrypt | latest | Password hashing |
| dotenv | latest | Environment variable management |

### Frontend
| Tool | Version | Purpose |
|------|---------|---------|
| React | 18.x | UI framework |
| React Router | v6 | Client-side routing |
| Axios | latest | HTTP client — easy JWT header attachment via interceptors |

### Dev Tools
| Tool | Purpose |
|------|---------|
| Prisma Studio | Visual DB inspector, comes free with Prisma |
| Postman / Insomnia | API testing during backend phase |

### Intentionally excluded
- **TypeScript** — JS is fine, keeps friction low while rebuilding
- **Redux** — React Context is enough for this app size
- **Docker** — useful later, not worth the overhead now

---

## Overview

A web app where organizations hold projects, projects have members, and members create reports documenting issues in a software development cycle. Think lightweight Jira / GitHub Issues.

---

## Entity Hierarchy

```
Organization
  └── Projects[]
        └── Reports[]

User
  ├── belongs to one Organization
  ├── assigned to many Projects
  └── authors many Reports
```

---

## Roles

| Role        | Scope         | Capabilities                                              |
|-------------|---------------|-----------------------------------------------------------|
| `superuser` | Platform      | View, restore, or hard-delete any Org. Seeded — no UI.   |
| `admin`     | Organization  | Manage Projects, assign/remove Members within their Org.  |
| `member`    | Project       | Create and interact with Reports on assigned Projects.    |

- **Superuser is seeded** directly into the DB at setup. No registration route.
- **One admin per Org** — the user who creates the Org becomes its Admin automatically (via transaction).
- Role is a field on the User record: `role: 'superuser' | 'admin' | 'member'`

---

## Entities & Fields

### Organization
```
id
name
description
deletedAt       -- null = active, timestamp = soft deleted
createdAt
updatedAt
```

### Project
```
id
name
description
organizationId  -- FK → Organization
deletedAt
createdAt
updatedAt
```

### User
```
id
name
email           -- unique
passwordHash
role            -- 'superuser' | 'admin' | 'member'
organizationId  -- FK → Organization (null for superuser)
deletedAt
createdAt
updatedAt
```

### UserProject (junction — many-to-many)
```
userId
projectId
assignedAt
```

### Report
```
id
title
description     -- body of the issue
severity        -- 'low' | 'medium' | 'high' | 'critical'
status          -- 'open' | 'in_progress' | 'resolved'
createdById     -- FK → User
projectId       -- FK → Project
organizationId  -- FK → Organization (denormalized for easy querying)
deletedAt
createdAt
updatedAt
```

### ReportAssignee (junction)
```
reportId
userId
-- responsible for resolving the issue
```

### ReportReviewer (junction)
```
reportId
userId
-- invited for visibility / feedback only
```

### Comment
```
id
body
reportId        -- FK → Report
authorId        -- FK → User
parentId        -- FK → Comment (nullable, self-referential — replies only, max 1 level deep)
deletedAt       -- tombstone: body replaced with "[deleted]", author stripped, node kept for reply visibility
createdAt
updatedAt
```
> Comments are threaded (1-level replies only) and tombstone-deleted. Separate table (not embedded) since this is SQL.
> Who can comment: org admin, report creator, report assignees, report reviewers.
> Who can edit: author only. Who can delete (tombstone): author or admin.

---

## Relationship Diagram

```
Organization  ──< Project ──< Report
     │                │          │
     └──< User >──────┘    assignees[]
           │               reviewers[]
           └──────────────< Comment
```

---

## Soft Deletes

All destructive operations use `deletedAt` timestamps instead of hard deletes.  
Backend filters `WHERE deletedAt IS NULL` on all standard queries.  
Superuser can query without this filter to view and restore deleted records.

This prevents accidental data loss (e.g. Admin deleting an Org) without needing complex DB transactions for recovery.

---

## Auth Strategy

- **JWT** — issued on login, stored as an `httpOnly` cookie named `token`
- **Middleware** — `authenticate` (valid token) and `authorize(roles[])` (role check) applied per route
- Passwords hashed with **bcrypt**

---

## Build Order

| # | Feature                         | Status      | Notes                                                    |
|---|---------------------------------|-------------|----------------------------------------------------------|
| 1 | Auth                            | ✅ done      | Register, Login, JWT middleware                          |
| 2 | Organizations                   | ✅ done      | Create org (auto-assigns Admin), join org                |
| 3 | Projects                        | ✅ done      | Create project, assign members (Admin)                   |
| 4 | Reports                         | ✅ done      | Full CRUD, assignees, reviewers                          |
| 5 | Comments                        | ✅ done      | Threaded (1-level), edit, tombstone delete               |
| 6 | React Frontend                  | 🔄 in progress | Foundation + auth pages + app shell + dashboard done  |

### Frontend — Progress

| Layer | Status | Notes |
|-------|--------|-------|
| Scaffold (Vite + React) | ✅ done | `frontend/` at project root |
| Axios instance | ✅ done | `src/api/axios.js`, `withCredentials: true` |
| Auth context | ✅ done | `src/context/AuthContext.jsx` — holds user, `login`, `logout`, `refreshUser` |
| Routing skeleton | ✅ done | React Router v6, `<ProtectedRoute>`, nested routes via `<Outlet>` |
| Register page | ✅ done | Form → `POST /auth/register` → auto-login → redirect |
| Login page | ✅ done | Form → `POST /auth/login` → redirect |
| App shell | ✅ done | `AppLayout` with sidebar (org name, nav links, user/logout) |
| Onboarding | ✅ done | Create org + browse/join orgs + sign-out button for waiting users |
| Dashboard | ✅ done | Project grid; create-project modal (admin); request-to-join button (member) |
| Project detail page | ✅ done | Header meta, reports grid, create-report modal, join requests (admin), danger zone delete (admin) |
| Members page | ✅ done | Org member list + org join request approve/deny (admin) — `/members` in sidebar |
| Report detail page | ⬅ next | View report, comments, assignees, reviewers |
| Admin member management | ⬅ next | Add/remove project members from project detail |

---

## Development Loop

1. **Feature** — describe what you want to build
2. **Reasoning** — approach, tradeoffs, gotchas explained first
3. **Code** — digestible chunks with inline comments
4. **Write** — developer types it out manually in their editor
5. **Feedback** — questions, changes, things that felt wrong → iterate

After each feature is complete, update `ARCHITECTURE.md` to reflect any new patterns, flows, or layers introduced. Keep the "What's not built yet" table current.

---

*Last updated: June 2026 — backend complete, frontend foundation + auth + shell + dashboard done*
