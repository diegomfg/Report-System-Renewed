const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Checks that the authenticated user has one of the allowed roles in the org.
// paramName defaults to 'id' (org routes use :id); pass 'orgId' for project routes.
// Attaches req.membership on success.
module.exports = (roles, paramName = 'id') => async (req, res, next) => {
    try {
        const organizationId = req.params[paramName];
        const userId = req.user.id;

        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: { userId, organizationId }
            }
        });

        if (!membership) {
            return res.status(403).json({ message: 'Forbidden: not a member of this organization' });
        }

        if (!roles.includes(membership.role)) {
            return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
        }

        req.membership = membership;
        next();
    } catch (error) {
        return res.status(500).json({ message: 'Authorization error' });
    }
};
