# Report System

A lightweight issue tracker for teams — think GitHub Issues, scoped to your own private organization.

Organizations hold projects, projects hold reports, and reports get discussed, assigned, and resolved as a team. No public visibility, no noise — just your org, your projects, and the issues that need attention.

---

## Features

- **Organizations** — create your own org or request to join an existing one. The creator automatically becomes its admin.
- **Projects** — organized under an org, with their own membership separate from the org at large.
- **Reports** — the core unit of work. Each has a title, description, severity (low/medium/high/critical), and status (open/in progress/resolved).
- **Assignees vs. reviewers** — assignees are responsible for resolving a report; reviewers are looped in for visibility and feedback only.
- **Threaded comments** — one level of replies, with edit and soft-delete (deleted comments leave a `[deleted]` tombstone so reply threads stay intact).
- **Role-based access** — admins manage org/project membership and can moderate any content; members work within the projects they belong to.
- **Join requests, not open doors** — joining an org or a project goes through an admin-approved request, keeping membership deliberate.
- **Org switching** — belong to more than one organization? Switch between them from a single account without logging out.
- **Safe destructive actions** — deleting a project or leaving an org always asks for confirmation first, and cleans up related data (like report assignments) consistently.

---

## How it works

```
Organization
  └── Projects
        └── Reports
              └── Comments (threaded, 1 level deep)

User
  ├── member of one or more Organizations (role: admin | member, per org)
  └── assigned to Projects within those orgs
```

Roles are **per-organization**, not global — you can be an admin in one org and a regular member in another. Within a project, being a member is what gives you posting rights (creating and updating reports); every org member can at least *see* all projects and reports in their org.

A typical flow: an admin creates a project → members request access (or get added directly) → a member files a report → the admin or report creator assigns someone to resolve it and optionally loops in reviewers → the team discusses it in comments until it's resolved.

---

## Tech stack

| Layer | Tool |
|-------|------|
| Backend runtime | Node.js |
| Backend framework | Express |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | JWT (httpOnly cookie) + bcrypt |
| Frontend | React 18 + React Router v6 |
| HTTP client | Axios |

No TypeScript, no Redux, no Docker (yet) — kept deliberately simple while the app is under active development.

---

## Getting started

**Prerequisites:** Node.js (LTS), PostgreSQL 15+ running locally.

**1. Clone and install**

```bash
git clone <this-repo-url>
cd Report-System-Renewed
cd backend && npm install
cd ../frontend && npm install
```

**2. Configure the backend**

Create `backend/.env`:

```
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/report_system"
JWT_SECRET="<any-long-random-string>"
PORT=3000
```

**3. Set up the database**

```bash
cd backend
npm run db:migrate
```

**4. Run it**

```bash
# Terminal 1 — backend (http://localhost:3000)
cd backend && npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd frontend && npm run dev
```

Open `http://localhost:5173`, register an account, and create your first organization.

---

## Learn more

For the full technical breakdown — API conventions, authorization rules, request lifecycle, and frontend architecture — see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
