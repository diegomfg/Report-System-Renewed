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
- List — includes `createdBy { id, name }`, `_count { assignees, reviewers, comments }`, and two booleans computed for the requesting user: `assignedToMe` and `isReviewer` (each derived from a relation filtered to `userId`, then stripped from the response — the frontend only sees the flags, not the raw filtered arrays)
- Detail — includes full `createdBy`, full `assignees[]`, `reviewers[]`, and `comments[]` (ordered oldest-first, flat — see note below)

**Note on detail `comments[]`:** `getReport`'s `comments` include is a flat list, not threaded, and isn't sanitized for tombstones. The frontend does not use it — it fetches comments separately via the dedicated comments endpoint (see below), which returns the properly threaded and sanitized shape. This flat field is effectively unused dead weight in the detail response; candidate for removal if the API is ever tightened up.

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
  components/
    PersonPicker.jsx   — shared select + "Add" control; used for assignees/reviewers (ReportPage) and project members (ProjectPage)
  context/
    AuthContext.jsx    — user identity state (id/name/email), login/logout/refreshUser, session restore
    OrgContext.jsx     — { orgId, orgName, role } for the org currently being viewed; provided by OrgLayout
  layouts/
    OrgLayout.jsx      — sidebar shell + <Outlet>, mounted at /orgs/:orgId; fetches org detail, provides OrgContext, renders the org switcher, mobile nav drawer, and leave-org action
  pages/
    LoginPage.jsx
    RegisterPage.jsx
    OrgHubPage.jsx     — post-login landing page: "your organizations" list, create-org panel, browse+join panel
    DashboardPage.jsx  — project cards grid; create-project modal (admin); request-to-join button (member)
    ProjectPage.jsx    — project detail; reports grid; join requests (admin); danger zone (admin)
    ReportPage.jsx     — report detail; edit modal; assignee/reviewer pickers; threaded comments; danger zone (admin/creator)
    MembersPage.jsx    — org member list; org join requests with approve/deny (admin)
  App.jsx              — route tree
  main.jsx             — BrowserRouter + AuthProvider wrapping App
  index.css            — design tokens + all shared styles
```

### Auth flow

1. On load, `AuthContext` calls `GET /api/auth/me`. If the httpOnly cookie is present and valid, the server returns `{ id, name, email }` and the user is restored into context. If not, `user` is `null`.
2. `login(userData)` — called after register/login API responses; sets user in state directly (no extra round-trip since the response already returns the user).
3. `logout()` — calls `POST /api/auth/logout` (clears the cookie server-side), then sets `user` to `null`.
4. `refreshUser()` — re-calls `GET /api/auth/me` and updates context.

**No `role` or `organizationId` on the user object.** A user can belong to multiple orgs (`OrganizationMember` is many-to-many), each with its own role, so neither concept makes sense as a flat field on the auth payload. Role and current-org context instead come from `OrgContext`, populated per-request by `OrgLayout` from `GET /api/orgs/:orgId` (which returns `yourRole` for that specific org).

### Route structure

```
/login                    → LoginPage          (public)
/register                 → RegisterPage       (public)
/                         → ProtectedRoute → OrgHubPage (no sidebar)
/orgs/:orgId              → ProtectedRoute → OrgLayout (sidebar + <Outlet>, provides OrgContext)
                                    ├── index                                    → DashboardPage
                                    ├── projects/:projectId                      → ProjectPage
                                    ├── projects/:projectId/reports/:reportId    → ReportPage
                                    └── members                                  → MembersPage
```

`ProtectedRoute` redirects unauthenticated users to `/login`. Org context lives entirely in the URL (`:orgId`) — there is no server-side "active org" session state and the JWT is never re-issued on switch. `OrgLayout` resolves `:orgId` to `{ name, role }` via `GET /api/orgs/:orgId` (403s if the user isn't a member) and writes it to `localStorage.lastOrgId` so the hub page can offer "Continue" into the last-visited org.

### Org hub page (`/`)

The landing page after every login — always shown, regardless of how many orgs the user belongs to (no auto-redirect into the last org, by design, so there's always a visible switch/create point).

- **Your organizations** — `GET /api/orgs` (all orgs the user belongs to, each with `yourRole`), sorted so the org matching `localStorage.lastOrgId` is pinned first with a "Continue" button; others show "Open".
- **Create org** — `POST /api/orgs` → navigates straight to `/orgs/:newOrgId`.
- **Browse orgs** — `GET /api/orgs/browse` → list with "Request to join" buttons → `POST /api/orgs/:id/request` → button becomes "Requested" (optimistic UI). Available even to users already in one or more orgs.

### Org switcher + leave org (sidebar, `OrgLayout.jsx`)

The org name in the sidebar is a button, not static text. Clicking it opens a dropdown (lazily fetches `GET /api/orgs` on first open) listing the user's other orgs; picking one navigates to `/orgs/:id`. A "See all organizations" link returns to the hub.

Below the nav links, "Leave organization" opens a confirm modal (simple Cancel/Leave, no name-typing — leaving is reversible via re-request) that calls `DELETE /orgs/:id/leave`. On success it clears `lastOrgId` from localStorage if it pointed at the org just left, then routes to `/`. The backend's sole-admin block ("Cannot leave: you are the only admin…") surfaces directly in the modal.

**What leaving does server-side (`leaveOrg` in `orgs.js`):** in one transaction — deletes the user's `UserProject` rows for that org's projects, deletes their `ReportAssignee`/`ReportReviewer` rows for that org's reports, then deletes the `OrganizationMember` row. `Report.createdById` is left untouched (historical provenance, same as GitHub keeping "opened by" after someone leaves). Blocked if the user is the org's only admin.

### Mobile nav

Below 768px, `.sidebar` becomes a fixed off-canvas drawer (`transform: translateX(-100%)` by default) triggered by a ☰ button fixed top-left. The toggle button only renders while the drawer is closed — this avoids it visually overlapping the drawer's own header once open, and closing already has three other paths (backdrop tap, any nav-link click, switching org). A dim backdrop (`.sidebar-backdrop`) sits between the content and the drawer and closes it on tap.

### Dashboard

Calls `GET /api/orgs/:orgId/projects` using `user.organizationId` from context. Renders a responsive card grid. Each card shows: name, description, member count, report count, created date, and a `yourStatus` badge (`Member` / `Pending`). Cards navigate to the project detail page on click. For `member`-role users on projects where `yourStatus === null`, a "Request to join" button appears that calls `POST /orgs/:orgId/projects/:projectId/request` and optimistically flips the card to "Pending". Admins see a "New Project" button in the header that opens a create-project modal.

### Project detail page

Calls `GET /orgs/:orgId/projects/:projectId` and `GET .../reports` in parallel (plus `GET .../requests` for admins). Renders four sections:

- **Header** — project name, description, created date, member count, report status summary.
- **Members** — current project members (`members.filter(projectStatus === 'in_project')`) as chip pills, visible to everyone. Admin-only: a remove (×) control per chip (opens `RemoveMemberModal` — simple Cancel/Remove confirmation, no name-typing, calls `DELETE .../members/:userId`) and an "Add member" `PersonPicker` sourced from org members with `projectStatus === null`. Users already mid-request (`projectStatus === 'pending'`) are deliberately excluded from the add-picker candidates — they're handled through the Join Requests section below instead, to avoid two overlapping paths for the same pending case. Styled larger and with a lighter fill (`.members-management` modifier class) than the assignee/reviewer chips on the report detail page, since this is the primary admin-facing management surface on this page.
- **Join Requests** (admin only) — pending project access requests with Approve / Deny inline buttons that call `PATCH .../requests/:requestId`.
- **Reports** — same card grid as the dashboard. Each report card shows title, severity badge (color-coded), status badge, created date, and author. Cards navigate to the report detail page on click. "New Report" button (for project members and admins) opens a create-report modal. Empty state shows a "Create new report" button for eligible users.
- **Danger Zone** (admin only) — "Delete Project" button that opens a GitHub-style confirmation modal requiring the admin to type the project name before the delete (`DELETE /orgs/:orgId/projects/:projectId`) is enabled.

**Assigned-to-me / reviewing badges:** each report card renders a small floating pill in the top-right corner (overlapping the card border, deliberately outside the normal badge row so it doesn't blend in with severity/status) — a purple "Assigned to you" tag when `assignedToMe` is true, an amber "Reviewing" tag when `isReviewer` is true. Both can appear together if the user holds both roles on the same report.

### Report detail page (`/projects/:projectId/reports/:reportId`)

Loads three endpoints in parallel: `GET .../reports/:reportId` (report + assignees + reviewers + createdBy), `GET .../reports/:reportId/comments` (threaded, sanitized comments — not the flat `report.comments` field), and `GET /orgs/:orgId/projects/:projectId` (reused only for its `members` list, to populate the assignee/reviewer pickers).

Permissions are mirrored client-side from the backend rules:
- **Edit fields** (title/description/severity/status) — any project member, via a single combined edit modal.
- **Manage assignees/reviewers, delete report** — admin or report creator only.
- **Comment** — admin, creator, assignee, or reviewer. Assignee candidates are filtered to project members not already assigned; reviewer candidates are any org member not already a reviewer.

- **Header** — title, Edit button (project members), severity/status badges, description, creator + created date.
- **Assignees / Reviewers** — chip lists with a remove (×) control per chip, plus the shared `PersonPicker` component below (`<select>` + "Add" button), both admin/creator only.
- **Comments** — top-level list with one level of nested replies (matches the backend's 1-level-deep rule); tombstoned comments render `"[deleted]"` with no author but keep their replies visible. Reply is only offered on top-level, non-deleted comments; Edit only for the comment's own author; Delete for author or admin.
- **Danger Zone** (admin/creator) — delete report via a simple confirm modal (no name-typing, unlike project deletion — a report is a smaller blast radius than a whole project).

All mutations (assignee/reviewer add-remove, comment post/edit/delete, report edit/delete) trigger a full reload rather than optimistic local state updates, consistent with the rest of the app's pattern (`ProjectPage`, `MembersPage`).

### Members page (`/members`)

Accessible from the sidebar by all users. Calls `GET /orgs/:orgId` for the member list and `GET /orgs/:orgId/requests` (admin only) for pending org join requests.

- **Join Requests** (admin only) — pending org-level join requests with Approve / Deny buttons calling `PATCH /orgs/:orgId/requests/:requestId`. Badge on the heading shows count when requests are present.
- **Members** — all current org members with name, email, and role badge.

### Onboarding sign-out

The onboarding page renders a "Sign out" button in the top-right corner so users who've submitted an org join request can log out and wait for approval without needing to use browser navigation.

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
| Frontend — foundation, auth pages, shell, onboarding | ✅ Done |
| Frontend — dashboard (project grid, create project, request to join) | ✅ Done |
| Frontend — project detail (reports grid, create report, join requests, delete) | ✅ Done |
| Frontend — members page (org member list, org join requests) | ✅ Done |
| Frontend — report detail page (view report, comments, assignees, reviewers, edit/delete) | ✅ Done |
| Frontend — admin member management (add/remove project members) | ✅ Done |
| Frontend — org switching (org hub page, sidebar switcher, org-scoped routing) | ✅ Done |
| Frontend — leave org action (sidebar, with confirm modal) | ✅ Done |
| Frontend — mobile nav (off-canvas drawer + burger toggle) | ✅ Done |
| Frontend — leave project action | Not yet built (backend `leaveProject` exists, unused) |
| Email invitations | Deferred |
| Superuser | Deferred |

\---

*Last updated: July 2026 — backend complete; frontend through org switching, leave-org, and mobile nav done. Leave-project action remains.*

