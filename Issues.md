# Issues

---

## #1 — Backend Foundation
**Status:** Open

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
