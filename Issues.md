# Issues

---

## #1 — Backend Foundation
**Status:** Closed

Set up the backend server structure, models, routes, and controllers.

### Scope
- `src/server.js` — Express app setup, middleware, port config
- `prisma/schema.prisma` — full schema (Organization, Project, User, UserProject, Report, ReportAssignee, ReportReviewer, Comment)
- `src/routes/` — route files per resource (auth, orgs, projects, reports, comments)
- `src/controllers/` — controller files per resource
- `src/middleware/` — `authenticate.js` (JWT verify), `authorize.js` (role check)
- `.env` — DATABASE_URL, JWT_SECRET
- Run initial Prisma migration

### Build order (per CLAUDE.md)
1. Auth — Register, Login, JWT middleware
2. Organizations
3. Projects
4. Reports
5. Comments

---

## #2 — Authentication
**Status:** Closed

Implement register, login, and JWT middleware.

### Scope
- `src/routes/auth.js` — POST `/api/auth/register`, POST `/api/auth/login`
- `src/controllers/auth.js` — register and login logic, bcrypt, JWT signing
- `src/middleware/authenticate.js` — verify JWT from httpOnly cookie
- `src/middleware/authorize.js` — role-based access check
- Install and wire up `cookie-parser` in `server.js`

---

## #3 — Schema Redesign: Many-to-Many User-Organization Relationship
**Status:** Closed

Redesign the schema to allow users to belong to multiple organizations and have role-per-org instead of global role.

### Rationale
- Users should be able to create and join multiple organizations freely
- Role should be org-specific (admin in one org, member in another)
- Users should be able to leave projects (stay in org) or leave orgs (cascade to all projects)
- Current design restricts users to one org, which doesn't match real-world usage

### Schema Changes

**Remove from User model:**
- `role` field (moving to OrganizationMember)
- `organizationId` field (moving to OrganizationMember)
- `organization` relation

**Add new OrganizationMember junction table:**
```prisma
model OrganizationMember {
  userId         String
  organizationId String
  role           Role      // admin or member (per-org)
  joinedAt       DateTime  @default(now())

  user         User         @relation(fields: [userId], references: [id])
  organization Organization @relation(fields: [organizationId], references: [id])

  @@id([userId, organizationId])
}
```

**Update Organization model:**
- Replace `users User[]` with `members OrganizationMember[]`

**Update User model:**
- Add `organizationMemberships OrganizationMember[]`

### Flow After Changes
- User creates org → OrganizationMember record created with role=admin
- User joins org → OrganizationMember record created with role=member
- User leaves project → UserProject record deleted, OrganizationMember stays
- User leaves org → OrganizationMember deleted + cascade delete all UserProject records for projects in that org

### Code Impact
- Auth middleware needs update (no more `req.user.role`, `req.user.organizationId`)
- Authorization logic needs to check OrganizationMember table per-org
- All org/project controllers need refactoring
- Superuser handling deferred for later

---

## #5 — Reports
**Status:** Closed

Full CRUD for reports scoped under `/api/orgs/:orgId/projects/:projectId/reports`.

### Scope
- `src/routes/reports.js` — 9 routes mounted under the project path
- `src/controllers/reports.js` — create, list, get, update, soft delete, manage assignees/reviewers

### Authorization model
- **Create / Update** — project members only (`UserProject` record required)
- **Read (list + detail)** — any org member
- **Delete** — admin or report creator only (soft delete)
- **Manage assignees** — admin or creator; target user must be a project member
- **Manage reviewers** — admin or creator; target user must be an org member

### Filtering
`GET .../reports?severity=high&status=open` — both params optional, invalid values silently ignored

---

## #6 — Comments
**Status:** Closed

Threaded comments on reports with editing and tombstone deletes.

### Scope
- `src/routes/comments.js`
- `src/controllers/comments.js`
- Mounted in `server.js` at `/api/orgs/:orgId/projects/:projectId/reports/:reportId/comments`
- Prisma migration: `add_comment_threading` — added `parentId` (nullable self-FK) and `deletedAt` to `Comment`

### Routes
- `GET    .../comments` — list comments (any org member); returns top-level comments with replies nested
- `POST   .../comments` — create comment (admin, report creator, assignees, reviewers); body: `{ body, parentId? }`
- `PATCH  .../comments/:commentId` — edit comment body (author only)
- `DELETE .../comments/:commentId` — tombstone (author or admin)

### Design decisions
- **1-level threading** — `parentId` self-FK on Comment; replies cannot themselves have a `parentId` (enforced at API layer)
- **Tombstone deletes** — `deletedAt` set instead of hard delete; response sanitizes to `body: "[deleted]"`, `author: null`; node stays in tree so replies remain visible; replying to or editing a tombstoned comment is blocked
- **Edit added** — PATCH route allows authors to edit their own comments; `updatedAt` signals "edited" to the frontend
- **`canComment` helper** — single Prisma query checks creator, assignees, reviewers in one shot; admin short-circuits before the query

### Known limitation
- `getReport` still returns `comments[]` as a flat array (no nested replies). Should be updated or removed when frontend is built.

---

## #4 — Frontend: React SPA
**Status:** Open (Next)

Build a React SPA consuming the finished API.

### Pre-flight
- Run `sudo apt update` before starting any frontend feature work.

### Foundation (must be done first, in order)
1. **Scaffold** — `npm create vite@latest frontend -- --template react` from project root
2. **Axios instance** — `src/api/axios.js`, base URL + `withCredentials: true` for cookie auth
3. **Auth context** — `src/context/AuthContext.jsx`, holds current user + `login()` / `logout()`
4. **Routing skeleton** — React Router v6, public routes (`/login`, `/register`) + `<ProtectedRoute>` wrapper

### Requirements
- **Auth pages** — Register and Login
- **Top-level dashboard** — Shows all organizations the user belongs to
- **Organization page** — Clicking an org shows its projects
- **Project page** — Shows reports; project members can create reports
- **Report detail** — Full report with assignees, reviewers, and threaded comments
- **Context switching** — User can switch between orgs
- **Leave actions** — UI for leaving projects and orgs

### Tech Stack (per CLAUDE.md)
- React 18.x + Vite
- React Router v6 for navigation
- Axios for API calls with `withCredentials: true` for cookie auth
- React Context for auth state (no Redux)
