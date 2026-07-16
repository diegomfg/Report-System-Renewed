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
| 6 | React Frontend                  | 🔄 in progress | Foundation, auth pages, shell, dashboard, project detail, members page, report detail, admin member management, org switching, leave-org, mobile nav, join-request notification badges, admin remove-member-from-org, and org membership activity log done. Leave-project action remains |

### Frontend — Progress

| Layer | Status | Notes |
|-------|--------|-------|
| Scaffold (Vite + React) | ✅ done | `frontend/` at project root |
| Axios instance | ✅ done | `src/api/axios.js`, `withCredentials: true` |
| Auth context | ✅ done | `src/context/AuthContext.jsx` — holds user identity (id/name/email), `login`, `logout`, `refreshUser` |
| Org context | ✅ done | `src/context/OrgContext.jsx` — `{ orgId, orgName, role }` for the org currently being viewed, provided by `OrgLayout` |
| Routing skeleton | ✅ done | React Router v6, `<ProtectedRoute>`, org-scoped nested routes (`/orgs/:orgId/...`) via `<Outlet>` |
| Register page | ✅ done | Form → `POST /auth/register` → auto-login → redirect to hub |
| Login page | ✅ done | Form → `POST /auth/login` → redirect to hub |
| Org hub page | ✅ done | `OrgHubPage` at `/` — post-login landing page: "your organizations" (pinned last-visited), create org, browse/join orgs, sign-out |
| App shell | ✅ done | `OrgLayout` with sidebar (clickable org-name switcher, nav links, leave-org, user/logout); mobile off-canvas drawer with burger toggle below 768px |
| Dashboard | ✅ done | Project grid; create-project modal (admin); request-to-join button (member) |
| Project detail page | ✅ done | Header meta, reports grid, create-report modal, join requests (admin), danger zone delete (admin) |
| Members page | ✅ done | Org member list + org join request approve/deny (admin) — `/orgs/:orgId/members` in sidebar. Admin-only remove-member (×) per row with confirm modal (`DELETE /orgs/:orgId/members/:userId`), hidden on the admin's own row. Admin-only collapsible "Activity" section (`GET /orgs/:orgId/activity`) showing the org's membership audit log — `joined` (with approving admin), `left`, `removed` (with acting admin) — backed by a new `OrgMembershipLog` table |
| Report detail page | ✅ done | `/orgs/:orgId/projects/:projectId/reports/:reportId` — edit modal (title/description/severity/status), assignee/reviewer chip lists + pickers, threaded comments (reply/edit/tombstone-delete) each rendered as its own tinted/bordered box for readability, danger zone delete |
| Admin member management | ✅ done | Members section on project detail — chip list + remove (with confirmation modal) + add-member picker (admin only), read-only list for others |
| Org switching | ✅ done | Org-scoped URLs, sidebar dropdown switcher, hub page always shown post-login (no auto-skip) |
| Leave org | ✅ done | Sidebar confirm modal → `DELETE /orgs/:id/leave`; backend also strips the user's `ReportAssignee`/`ReportReviewer` rows for that org on leave (previously only `UserProject` was cleaned up) |
| Join-request notification badges | ✅ done | Admin-only sidebar badges (Projects/Members nav) for pending org + project join requests, plus a "N pending" tag on the dashboard project card. Live-refreshes via `OrgContext.refreshBadges()` after approve/deny — no page reload needed. Fixed a regression where the count logic read a nonexistent `req.user.role` instead of `req.membership.role`, silently zeroing the count for every admin |

---

## Development Loop

1. **Feature** — describe what you want to build
2. **Reasoning** — approach, tradeoffs, gotchas explained first
3. **Code** — digestible chunks with inline comments
4. **Write** — developer types it out manually in their editor
5. **Feedback** — questions, changes, things that felt wrong → iterate

After each feature is complete, update `ARCHITECTURE.md` to reflect any new patterns, flows, or layers introduced. Keep the "What's not built yet" table current.

---

*Last updated: July 2026 — backend complete, frontend through org switching and leave-org done (report detail, comments, assignees, reviewers, edit/delete, assigned-to-me/reviewing badges, project member add/remove with confirmation modal, org-scoped routing with hub page and sidebar switcher, leave-org with assignee/reviewer cleanup, mobile off-canvas nav, live-refreshing join-request notification badges, tinted/bordered comment boxes, admin remove-member-from-org, and an org membership activity log (join/leave/removed events, append-only `OrgMembershipLog`) surfaced on the Members page). Leave-project action remains*
