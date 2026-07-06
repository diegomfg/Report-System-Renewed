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
- `getReport` still returns `comments[]` as a flat array (no nested replies). Worked around at the frontend layer (see #7) by calling the dedicated comments endpoint instead — the flat field itself was never fixed and is currently unused dead weight in the detail response.

---

## #7 — Frontend: Report Detail Page
**Status:** Closed

Report detail page at `/projects/:projectId/reports/:reportId` — view/edit a report, manage assignees and reviewers, and threaded commenting.

### Scope
- `frontend/src/pages/ReportPage.jsx` — new page, route added in `App.jsx`
- Edit modal — title/description/severity/status, any project member (mirrors backend's `updateReport` rule, not just admin/creator)
- Assignee/reviewer chip lists + `<select>` picker, admin/creator only — candidates filtered client-side (assignees: project members not already assigned; reviewers: org members not already reviewers)
- Threaded comments — reply (top-level only), edit (author only), tombstone delete (author or admin) — fetched from the dedicated `GET .../comments` endpoint, not `report.comments`
- Danger zone delete (admin/creator) — simple confirm modal, no name-typing (smaller blast radius than deleting a whole project)
- Report cards on `ProjectPage` now navigate to the detail page on click (previously non-interactive)

### Follow-up: assignment badges
Added a purple "Assigned to you" / amber "Reviewing" floating corner tag to report cards, so a user scanning a project's reports grid can immediately spot which reports involve them.
- Backend: `listReports` now includes `assignees`/`reviewers` filtered to `req.user.id`, collapsed into `assignedToMe`/`isReviewer` booleans on the response (raw filtered arrays stripped before sending)
- Frontend: badges render as absolutely-positioned pills hanging over the top-right corner of `.project-card`, deliberately pulled out of the existing severity/status badge row so they read as a distinct signal at a glance

### Gotcha hit during this work
Local dev DB was missing the `add_comment_threading` migration (applied via `prisma migrate deploy`) **and** the generated Prisma client was stale relative to `schema.prisma` (fixed via `prisma generate`) — these are two independent failure modes that both surface as the same `Invalid prisma.comment.findMany() invocation` error. Worth checking both if this resurfaces after a fresh clone or environment reset.

---

## #8 — Frontend: Admin Member Management
**Status:** Closed

Add/remove project members directly from the project detail page.

### Scope
- New "Members" section on `ProjectPage.jsx`, between the header and Join Requests — visible to all viewers as a read-only chip list, with add/remove controls gated to admin
- Add-member picker sourced from org members with `projectStatus === null` only — users with a pending request are deliberately excluded, since they already have a dedicated Approve/Deny flow in the existing Join Requests section (showing them in both places would create two overlapping paths for the same action)
- `RemoveMemberModal` — simple Cancel/Remove confirmation (no name-typing, unlike project deletion), consistent with the report delete confirm's weight
- Extracted `PersonPicker` (originally built inline for #7's assignee/reviewer pickers) into `frontend/src/components/PersonPicker.jsx` — first shared component in the frontend, now used by both `ReportPage` and `ProjectPage`
- Follow-up polish: the Members section chips/picker/buttons were sized up and given a lighter fill (`.members-management` CSS modifier) so this admin-facing surface reads as more prominent than the assignee/reviewer chips on the report detail page

### Explicitly out of scope
- Self-service "Leave Project" button for non-admin members — backend `leaveProject` endpoint already exists but is unused; deferred as a separate follow-up rather than folded in here

---

## #4 — Frontend: React SPA
**Status:** Open (Next) — auth, shell, dashboard, project detail, members page, report detail (#7), and admin member management (#8) all done; org switching and leave-project/org actions remain

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
- **Project page** — Shows reports; project members can create reports ✅
- **Report detail** — Full report with assignees, reviewers, and threaded comments ✅ (#7)
- **Context switching** — User can switch between orgs
- **Leave actions** — UI for leaving projects and orgs

### Tech Stack (per CLAUDE.md)
- React 18.x + Vite
- React Router v6 for navigation
- Axios for API calls with `withCredentials: true` for cookie auth
- React Context for auth state (no Redux)
