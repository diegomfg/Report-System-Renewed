const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Verify a project exists, is not deleted, and belongs to the given org.
// Returns the project or null.
async function findProject(projectId, orgId) {
    return prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId, deletedAt: null }
    });
}

// POST /api/orgs/:orgId/projects
// Admin: create a project inside the org
exports.createProject = async (req, res) => {
    try {
        const { orgId } = req.params;
        const { name, description } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const project = await prisma.$transaction(async (tx) => {
            const p = await tx.project.create({
                data: {
                    name: name.trim(),
                    description: description?.trim() || null,
                    organizationId: orgId
                }
            });
            await tx.userProject.create({ data: { userId: req.user.id, projectId: p.id } });
            return p;
        });

        return res.status(201).json({ message: 'Project created successfully', project });

    } catch (error) {
        console.error('Create project error:', error);
        return res.status(500).json({ error: 'Failed to create project' });
    }
};

// GET /api/orgs/:orgId/projects
// Any org member: list all projects in the org with the current user's access status
exports.listProjects = async (req, res) => {
    try {
        const { orgId } = req.params;
        const userId = req.user.id;

        const isAdmin = req.user.role === 'admin';

        const [projects, userProjectAccess, userPendingRequests, adminPendingRequests] = await Promise.all([
            prisma.project.findMany({
                where: { organizationId: orgId, deletedAt: null },
                include: { _count: { select: { members: true, reports: true } } },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.userProject.findMany({
                where: { userId, project: { organizationId: orgId } },
                select: { projectId: true }
            }),
            prisma.projectAccessRequest.findMany({
                where: { userId, status: 'pending', project: { organizationId: orgId } },
                select: { projectId: true }
            }),
            isAdmin
                ? prisma.projectAccessRequest.findMany({
                    where: { status: 'pending', project: { organizationId: orgId } },
                    select: { projectId: true }
                })
                : Promise.resolve([])
        ]);

        const inProjectSet = new Set(userProjectAccess.map(p => p.projectId));
        const pendingSet = new Set(userPendingRequests.map(r => r.projectId));
        const pendingCountMap = adminPendingRequests.reduce((acc, r) => {
            acc[r.projectId] = (acc[r.projectId] || 0) + 1;
            return acc;
        }, {});

        const enriched = projects.map(p => ({
            ...p,
            yourStatus: inProjectSet.has(p.id) ? 'in_project'
                      : pendingSet.has(p.id)   ? 'pending'
                      : null,
            pendingRequestsCount: pendingCountMap[p.id] || 0
        }));

        return res.status(200).json({ projects: enriched });

    } catch (error) {
        console.error('List projects error:', error);
        return res.status(500).json({ error: 'Failed to list projects' });
    }
};

// GET /api/orgs/:orgId/projects/:projectId
// Any org member: project details + all org members with project status badges
exports.getProject = async (req, res) => {
    try {
        const { orgId, projectId } = req.params;

        const project = await findProject(projectId, orgId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const [orgMembers, projectMembers, pendingRequests] = await Promise.all([
            prisma.organizationMember.findMany({
                where: { organizationId: orgId },
                include: {
                    user: { select: { id: true, name: true, email: true } }
                }
            }),
            prisma.userProject.findMany({
                where: { projectId },
                select: { userId: true }
            }),
            prisma.projectAccessRequest.findMany({
                where: { projectId, status: 'pending' },
                select: { userId: true }
            })
        ]);

        const inProjectSet = new Set(projectMembers.map(m => m.userId));
        const pendingSet = new Set(pendingRequests.map(r => r.userId));

        const members = orgMembers.map(m => ({
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            orgRole: m.role,
            projectStatus: inProjectSet.has(m.userId) ? 'in_project'
                         : pendingSet.has(m.userId)   ? 'pending'
                         : null
        }));

        return res.status(200).json({ project, members });

    } catch (error) {
        console.error('Get project error:', error);
        return res.status(500).json({ error: 'Failed to fetch project' });
    }
};

// DELETE /api/orgs/:orgId/projects/:projectId
// Admin: soft delete a project
exports.deleteProject = async (req, res) => {
    try {
        const { orgId, projectId } = req.params;

        const project = await findProject(projectId, orgId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        await prisma.project.update({
            where: { id: projectId },
            data: { deletedAt: new Date() }
        });

        return res.status(200).json({ message: 'Project deleted' });

    } catch (error) {
        console.error('Delete project error:', error);
        return res.status(500).json({ error: 'Failed to delete project' });
    }
};

// POST /api/orgs/:orgId/projects/:projectId/members
// Admin: directly add an org member to the project
exports.addMember = async (req, res) => {
    try {
        const { orgId, projectId } = req.params;
        const { userId } = req.body;

        if (!userId) return res.status(400).json({ error: 'userId is required' });

        const project = await findProject(projectId, orgId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const orgMembership = await prisma.organizationMember.findUnique({
            where: { userId_organizationId: { userId, organizationId: orgId } }
        });
        if (!orgMembership) {
            return res.status(400).json({ error: 'User is not a member of this organization' });
        }

        const existing = await prisma.userProject.findUnique({
            where: { userId_projectId: { userId, projectId } }
        });
        if (existing) {
            return res.status(400).json({ error: 'User already has access to this project' });
        }

        // Add to project and resolve any pending request in one transaction
        await prisma.$transaction(async (tx) => {
            await tx.userProject.create({ data: { userId, projectId } });

            await tx.projectAccessRequest.updateMany({
                where: { userId, projectId, status: 'pending' },
                data: { status: 'approved', resolvedAt: new Date() }
            });
        });

        return res.status(201).json({ message: 'User added to project' });

    } catch (error) {
        console.error('Add member error:', error);
        return res.status(500).json({ error: 'Failed to add member' });
    }
};

// DELETE /api/orgs/:orgId/projects/:projectId/members/:userId
// Admin: remove a member from the project
exports.removeMember = async (req, res) => {
    try {
        const { orgId, projectId, userId } = req.params;

        const project = await findProject(projectId, orgId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const existing = await prisma.userProject.findUnique({
            where: { userId_projectId: { userId, projectId } }
        });
        if (!existing) {
            return res.status(404).json({ error: 'User is not a member of this project' });
        }

        await prisma.userProject.delete({
            where: { userId_projectId: { userId, projectId } }
        });

        return res.status(200).json({ message: 'User removed from project' });

    } catch (error) {
        console.error('Remove member error:', error);
        return res.status(500).json({ error: 'Failed to remove member' });
    }
};

// POST /api/orgs/:orgId/projects/:projectId/request
// Any org member: request access to a project
exports.requestAccess = async (req, res) => {
    try {
        const { orgId, projectId } = req.params;
        const userId = req.user.id;

        const project = await findProject(projectId, orgId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const existing = await prisma.userProject.findUnique({
            where: { userId_projectId: { userId, projectId } }
        });
        if (existing) {
            return res.status(400).json({ error: 'You already have access to this project' });
        }

        const existingRequest = await prisma.projectAccessRequest.findUnique({
            where: { userId_projectId: { userId, projectId } }
        });

        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                return res.status(400).json({ error: 'You already have a pending request for this project' });
            }
            const updated = await prisma.projectAccessRequest.update({
                where: { userId_projectId: { userId, projectId } },
                data: { status: 'pending', requestedAt: new Date(), resolvedAt: null }
            });
            return res.status(200).json({ message: 'Access request resubmitted', request: updated });
        }

        const request = await prisma.projectAccessRequest.create({
            data: { userId, projectId }
        });

        return res.status(201).json({ message: 'Access request submitted', request });

    } catch (error) {
        console.error('Request access error:', error);
        return res.status(500).json({ error: 'Failed to submit access request' });
    }
};

// GET /api/orgs/:orgId/projects/:projectId/requests
// Admin: view pending access requests for a project
exports.getAccessRequests = async (req, res) => {
    try {
        const { orgId, projectId } = req.params;

        const project = await findProject(projectId, orgId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const requests = await prisma.projectAccessRequest.findMany({
            where: { projectId, status: 'pending' },
            include: {
                user: { select: { id: true, name: true, email: true } }
            },
            orderBy: { requestedAt: 'asc' }
        });

        return res.status(200).json({ requests });

    } catch (error) {
        console.error('Get access requests error:', error);
        return res.status(500).json({ error: 'Failed to fetch access requests' });
    }
};

// PATCH /api/orgs/:orgId/projects/:projectId/requests/:requestId
// Admin: approve or reject a project access request
exports.resolveAccessRequest = async (req, res) => {
    try {
        const { orgId, projectId, requestId } = req.params;
        const { action } = req.body;

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ error: 'action must be "approve" or "reject"' });
        }

        const project = await findProject(projectId, orgId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const accessRequest = await prisma.projectAccessRequest.findFirst({
            where: { id: requestId, projectId, status: 'pending' }
        });
        if (!accessRequest) {
            return res.status(404).json({ error: 'Pending request not found' });
        }

        if (action === 'approve') {
            await prisma.$transaction(async (tx) => {
                await tx.projectAccessRequest.update({
                    where: { id: requestId },
                    data: { status: 'approved', resolvedAt: new Date() }
                });
                await tx.userProject.create({
                    data: { userId: accessRequest.userId, projectId }
                });
            });
            return res.status(200).json({ message: 'Request approved, user added to project' });
        }

        await prisma.projectAccessRequest.update({
            where: { id: requestId },
            data: { status: 'rejected', resolvedAt: new Date() }
        });

        return res.status(200).json({ message: 'Request rejected' });

    } catch (error) {
        console.error('Resolve access request error:', error);
        return res.status(500).json({ error: 'Failed to resolve access request' });
    }
};

// DELETE /api/orgs/:orgId/projects/:projectId/leave
// Any project member: leave a project
exports.leaveProject = async (req, res) => {
    try {
        const { orgId, projectId } = req.params;
        const userId = req.user.id;

        const project = await findProject(projectId, orgId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const membership = await prisma.userProject.findUnique({
            where: { userId_projectId: { userId, projectId } }
        });
        if (!membership) {
            return res.status(404).json({ error: 'You are not a member of this project' });
        }

        await prisma.userProject.delete({
            where: { userId_projectId: { userId, projectId } }
        });

        return res.status(200).json({ message: 'Successfully left project' });

    } catch (error) {
        console.error('Leave project error:', error);
        return res.status(500).json({ error: 'Failed to leave project' });
    }
};
