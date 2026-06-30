# Architecture Reference

> This document explains how the system is structured and why. Read it top to bottom once to build a mental model, then use it as a reference. Update it when a pattern changes or a new layer is added.

\---

## What this app is

A lightweight issue tracker. Organizations hold projects, projects hold reports. Users belong to organizations, get access to projects, and file reports against them. Think GitHub Issues scoped to a private org.

\---

## Entity Hierarchy

```
Organization
  └── Projects\\\[]
        └── Reports\\\[]

User
  └── OrganizationMember (per org: role = admin | member)
        └── UserProject (per project: has posting rights)
```

A user has no global role. Their role is always relative to a specific organization — they can be admin in one and member in another. A user with no `OrganizationMember` record for a given org has zero access to it.

\---

## Authentication

**Flow:** `POST /api/auth/register` or `/login` → bcrypt password check → JWT signed with `JWT\\\_SECRET` → set as `httpOnly` cookie named `token`.

The JWT payload contains only `{ id, email }`. No role, no org — those are looked up from the database at request time, not baked into the token.

**Middleware — `authenticate.js`:**  
Reads `req.cookies.token`, verifies it, and attaches the decoded payload to `req.user`. Every protected route runs this first. If the token is missing or invalid, the request stops here with a 401.

```
Request → authenticate → req.user = { id, email } → controller
```

\---

## Authorization

Role is per-org, stored in `OrganizationMember`. There is no global role field on `User`.

**Middleware — `authorize(roles\\\[]).js`:**  
Runs after `authenticate`. Reads the org ID from `req.params.id`, queries `OrganizationMember` for that user+org pair, and checks whether the user's role is in the allowed list. On success it attaches `req.membership` so controllers don't need to re-query it.

```
Request → authenticate → authorize(\\\['admin']) → req.membership = { role, ... } → controller
```

For org routes the org ID lives at `req.params.id` — `authorize(['admin'])` uses the default. For project routes the org ID lives at `req.params.orgId` — pass it explicitly: `authorize(['admin'], 'orgId')`.

**Why not put the role in the JWT?**  
Because a user's role can change (member promoted to admin, or removed from an org) without a new login. Baking it into the token means the app would trust stale data until the token expires. Looking it up per-request keeps authorization accurate.

\---

## Membership Flows

### Joining an organization

Users do not self-add to orgs. There are two paths:

1. **Create org** — `POST /api/orgs` — creates the org and immediately creates an `OrganizationMember` record with `role: admin` in a single transaction. The creator is always the first admin.
2. **Request to join** — `POST /api/orgs/:id/request` — creates an `OrgJoinRequest` record with `status: pending`. The org admin reviews it via `GET /api/orgs/:id/requests` and approves or rejects via `PATCH /api/orgs/:id/requests/:requestId`. Approval creates the `OrganizationMember` record in a transaction alongside updating the request status.

Email-based invitations are planned but not yet built.

### Getting access to a project

All org members can **see** every project in their org. To **post reports**, a `UserProject` record must exist.

Two paths:

1. **Admin directly adds a user** — `POST /api/orgs/:orgId/projects/:projectId/members` — creates `UserProject` immediately. Also auto-resolves any pending `ProjectAccessRequest` from that user.
2. **Member requests access** — `POST /api/orgs/:orgId/projects/:projectId/request` — creates a `ProjectAccessRequest` with `status: pending`. Admin approves or rejects via `PATCH /api/orgs/:orgId/projects/:projectId/requests/:requestId`.

The project list (`GET /api/orgs/:orgId/projects`) includes a `yourStatus` field per project — `"in_project"`, `"pending"`, or `null` — so the frontend can render access badges without a separate request. The project detail endpoint (`GET /api/orgs/:orgId/projects/:projectId`) returns all org members enriched with a `projectStatus` field using the same values.

\---

## Reports

Reports are scoped under a project: `/api/orgs/:orgId/projects/:projectId/reports`.

**Authorization tiers:**

| Action | Who |
|--------|-----|
| Create | Project member (`UserProject` record required) |
| List / Get | Any org member |
| Update (any field) | Project member |
| Delete (soft) | Admin or report creator |
| Add / remove assignee | Admin or creator — assignee must be a project member |
| Add / remove reviewer | Admin or creator — reviewer must be an org member |

Admin and creator checks use `req.membership.role === 'admin'` (set by `authorize` middleware) and `report.createdById === req.user.id` respectively — no extra DB query needed for either check.

**Assignees vs Reviewers:**
- `ReportAssignee` — responsible for resolving the issue. Must hold a `UserProject` record.
- `ReportReviewer` — invited for visibility/feedback only. Org membership is enough; no project access required.

**Filtering:**
`GET .../reports` accepts optional `?severity=` and `?status=` query params. Invalid enum values are silently ignored so the request always returns rather than erroring on a bad filter.

**List vs Detail responses:**
- List — includes `createdBy { id, name }` and `_count { assignees, reviewers, comments }`
- Detail — includes full `createdBy`, full `assignees[]`, `reviewers[]`, and `comments[]` (ordered oldest-first)

\---

## Comments

Comments are scoped under a report: `/api/orgs/:orgId/projects/:projectId/reports/:reportId/comments`.

**Threading:** 1-level only. A comment may have a `parentId` pointing to another comment in the same report. Replies cannot themselves have a `parentId` — this is enforced at the API layer, not the DB level.

**Authorization tiers:**

| Action | Who |
|--------|-----|
| List | Any org member |
| Create | Admin, report creator, report assignees, report reviewers |
| Edit (PATCH) | Comment author only |
| Delete (tombstone) | Comment author or admin |

The `canComment` helper in the controller runs a single Prisma query that checks `createdById`, `assignees`, and `reviewers` in one shot. Admin is short-circuited before the query using `req.membership.role`.

**Tombstone deletes:** Comments are never hard-deleted. `deletedAt` is set instead. The `sanitize()` helper in the controller transforms tombstoned nodes before sending the response — `body` becomes `"[deleted]"` and `author` is set to `null`. The node stays in the tree so replies remain visible.

Replying to a tombstoned parent is blocked at the API layer. Editing a tombstoned comment is also blocked.

**List response shape:**
```
[
  { id, body, author, parentId: null, replies: [{ id, body, author, parentId, ... }] },
  ...
]
```
Top-level comments ordered oldest-first; replies within each comment also oldest-first.

\---

## Soft Deletes

Organizations, Projects, Reports, and Comments have a `deletedAt` field. Deletion sets this timestamp rather than removing the row.

All standard queries filter `WHERE deletedAt IS NULL`. This means soft-deleted records are invisible to normal users but recoverable. When superuser functionality is added, it will query without this filter.

Comments use a slightly different flavor called **tombstoning** — the row stays fully visible in thread queries but its content is sanitized in the response (`body: "[deleted]"`, `author: null`). This preserves thread structure even when a parent is deleted.

No cascading hard deletes — if you delete an org, its projects and reports are not removed, just unreachable through normal queries.

\---

## API Conventions

* All routes live under `/api/`
* Auth routes: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`
* Resource routes follow REST: `/api/orgs`, `/api/orgs/:id`, etc.
* Nested actions use descriptive segments: `/api/orgs/:id/request`, `/api/orgs/:id/requests/:requestId`
* Responses always return a top-level key matching the resource: `{ organization }`, `{ organizations }`, `{ requests }`, etc.
* Errors return `{ error: "message" }`

\---

## Frontend

The frontend lives in `frontend/` at the project root. It's a Vite + React app (no TypeScript, no Redux).

### Stack

| Tool | Purpose |
|------|---------|
| Vite + React 18 | Scaffold and dev server |
| React Router v6 | Client-side routing with nested routes |
| Axios | HTTP client — `withCredentials: true` sends the cookie on every request |

### File structure

```
frontend/src/
  api/
    axios.js           — preconfigured Axios instance (baseURL + credentials)
  context/
    AuthContext.jsx    — user state, login/logout/refreshUser, session restore
  layouts/
    AppLayout.jsx      — sidebar shell + <Outlet>; shows OnboardingPage if no org
  pages/
    LoginPage.jsx
    RegisterPage.jsx
    OnboardingPage.jsx — create org or browse+join; shown when user has no org
    DashboardPage.jsx  — project cards grid
  App.jsx              — route tree
  main.jsx             — BrowserRouter + AuthProvider wrapping App
  index.css            — design tokens + all shared styles
```

### Auth flow

1. On load, `AuthContext` calls `GET /api/auth/me`. If the httpOnly cookie is present and valid, the server returns `{ id, name, email, role, organizationId }` and the user is restored into context. If not, `user` is `null`.
2. `login(userData)` — called after register/login API responses; sets user in state directly (no extra round-trip since the response already returns the user).
3. `logout()` — calls `POST /api/auth/logout` (clears the cookie server-side), then sets `user` to `null`.
4. `refreshUser()` — re-calls `GET /api/auth/me` and updates context. Used after creating an org so the new `organizationId` is reflected without forcing a full page reload.

`role` and `organizationId` on the user object come from `OrganizationMember`, not from the `User` table directly. `GET /api/auth/me` joins through that table before responding.

### Route structure

```
/login          → LoginPage          (public)
/register       → RegisterPage       (public)
/               → ProtectedRoute
                    └── AppLayout
                          ├── (no org) → OnboardingPage (inline, no sidebar)
                          └── (has org) → Sidebar + <Outlet>
                                └── index → DashboardPage
```

`ProtectedRoute` redirects unauthenticated users to `/login`. `AppLayout` gates on `user.organizationId` — users with no org see the onboarding panel instead of the sidebar.

### Onboarding

Shown inline when `user.organizationId === null`. Two panels side by side:

- **Create org** — `POST /api/orgs` → on success, `refreshUser()` pulls the new `organizationId` into context → `AppLayout` re-renders into the full shell automatically.
- **Browse orgs** — `GET /api/orgs/browse` → list with "Request to join" buttons → `POST /api/orgs/:id/request` → button becomes "Requested" (optimistic UI).

### Dashboard

Calls `GET /api/orgs/:orgId/projects` using `user.organizationId` from context. Renders a responsive card grid. Each card shows: name, description, member count, report count, and a `yourStatus` badge (`Member` / `Pending`) from the API's per-project access field.

\---

## Request Lifecycle (end to end)

```
HTTP Request
  │
  ├─ authenticate.js        — verify JWT cookie → req.user
  ├─ authorize(\\\['admin'])   — check OrganizationMember → req.membership  (admin-only routes)
  │
  └─ Controller
       ├─ Validate input
       ├─ Query via Prisma (always filter deletedAt: null)
       ├─ Use $transaction for multi-step writes
       └─ Return { resource } or { error }
```

\---

## What's not built yet

| Layer | Status |
|-------|--------|
| Auth | ✅ Done |
| Organizations + membership flows | ✅ Done |
| Projects | ✅ Done |
| Reports | ✅ Done |
| Comments | ✅ Done |
| Frontend — foundation, auth pages, shell, dashboard | ✅ Done |
| Frontend — project detail page | ⬅ Next |
| Frontend — reports (create/view within a project) | ⬅ Next |
| Frontend — admin flows (create project, manage members) | ⬅ Next |
| Email invitations | Deferred |
| Superuser | Deferred |

\---

*Last updated: June 2026 — backend complete, frontend foundation through dashboard done*

