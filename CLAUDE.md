# Report System — Project Design Document

> Method: Feature → Reasoning → Code → Write → Feedback loop

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
createdAt
updatedAt
```
> Comments are threaded and timestamped. Separate table (not embedded) since this is SQL.

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

- **JWT** — issued on login, stored client-side (httpOnly cookie or Authorization header TBD)
- **Middleware** — `authenticate` (valid token) and `authorize(roles[])` (role check) applied per route
- Passwords hashed with **bcrypt**

---

## Build Order

| # | Feature                         | Notes                                      |
|---|---------------------------------|--------------------------------------------|
| 1 | Auth                            | Register, Login, JWT middleware            |
| 2 | Organizations                   | Create org (auto-assigns Admin), join org  |
| 3 | Projects                        | Create project, assign members (Admin)     |
| 4 | Reports                         | Full CRUD, assignees, reviewers            |
| 5 | Comments                        | Add / delete threaded comments on Reports  |
| 6 | React Frontend                  | UI layer consuming the finished API        |

---

## Development Loop

1. **Feature** — describe what you want to build
2. **Reasoning** — approach, tradeoffs, gotchas explained first
3. **Code** — digestible chunks with inline comments
4. **Write** — developer types it out manually in their editor
5. **Feedback** — questions, changes, things that felt wrong → iterate

---

*Last updated: June 2026*
