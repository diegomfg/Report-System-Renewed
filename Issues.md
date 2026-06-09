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
**Status:** Open

Implement register, login, and JWT middleware.

### Scope
- `src/routes/auth.js` — POST `/api/auth/register`, POST `/api/auth/login`
- `src/controllers/auth.js` — register and login logic, bcrypt, JWT signing
- `src/middleware/authenticate.js` — verify JWT from httpOnly cookie
- `src/middleware/authorize.js` — role-based access check
- Install and wire up `cookie-parser` in `server.js`
