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
**Status:** Open

Threaded comments on reports.

### Scope
- `src/routes/comments.js`
- `src/controllers/comments.js`
- Mount in `server.js`

### Routes
- `POST /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments` — add comment (project member)
- `GET /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments` — list comments (org member)
- `DELETE /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments/:commentId` — delete comment (author or admin)

### Notes
- No edit on comments — delete and re-post is the pattern (keeps it simple)
- Comments are already included in `GET .../reports/:reportId` via the `getReport` controller, so the list endpoint is mainly for paginated/standalone use if needed later

---

## #4 — Frontend: React SPA
**Status:** Open (Next after Comments)

Build a frontend dashboard for navigating organizations and projects.

### Requirements
- **Top-level dashboard** — Shows all organizations the user belongs to
- **Organization page** — Clicking an org shows its projects
- **Context switching** — User can switch between orgs to work in different contexts
- **Leave actions** — UI for leaving projects and orgs

### Tech Stack (per CLAUDE.md)
- React 18.x
- React Router v6 for navigation
- Axios for API calls with JWT interceptor

### Deferred Until
- Backend org/project CRUD is complete and tested
- Schema redesign (#3) is implemented
