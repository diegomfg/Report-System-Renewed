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

This middleware is only used on routes where the org ID is in `req.params.id`. Project and report routes will handle their own authorization once built, since they resolve org context via a different path (project → org lookup).

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

1. **Admin directly adds a user** — no request needed, admin just creates the `UserProject` record.
2. **Member requests access** — creates a `ProjectAccessRequest` with `status: pending`. Admin approves, which creates the `UserProject` record.

\---

## Soft Deletes

Organizations, Projects, and Reports have a `deletedAt` field. Deletion sets this timestamp rather than removing the row.

All standard queries filter `WHERE deletedAt IS NULL`. This means soft-deleted records are invisible to normal users but recoverable. When superuser functionality is added, it will query without this filter.

No cascading hard deletes — if you delete an org, its projects and reports are not removed, just unreachable through normal queries.

\---

## API Conventions

* All routes live under `/api/`
* Auth routes: `/api/auth/register`, `/api/auth/login`
* Resource routes follow REST: `/api/orgs`, `/api/orgs/:id`, etc.
* Nested actions use descriptive segments: `/api/orgs/:id/request`, `/api/orgs/:id/requests/:requestId`
* Responses always return a top-level key matching the resource: `{ organization }`, `{ organizations }`, `{ requests }`, etc.
* Errors return `{ error: "message" }`

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

|Layer|Status|
|-|-|
|Auth|Done|
|Organizations + membership flows|Done|
|Projects|Next|
|Reports|Pending|
|Comments|Pending|
|Frontend (React)|Pending|
|Email invitations|Deferred|
|Superuser|Deferred|

\---

*Last updated: June 2026*

