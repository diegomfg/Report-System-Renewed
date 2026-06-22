const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// POST /api/orgs
// Creates org and adds creator as admin
exports.createOrg = async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Organization name is required' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const org = await tx.organization.create({
                data: {
                    name: name.trim(),
                    description: description?.trim() || null
                }
            });

            await tx.organizationMember.create({
                data: { userId, organizationId: org.id, role: 'admin' }
            });

            return org;
        });

        return res.status(201).json({
            message: 'Organization created successfully',
            organization: result
        });

    } catch (error) {
        console.error('Create org error:', error);
        return res.status(500).json({ error: 'Failed to create organization' });
    }
};

// GET /api/orgs/browse
// List all active orgs so users can find ones to request joining
exports.listOrgs = async (req, res) => {
    try {
        const orgs = await prisma.organization.findMany({
            where: { deletedAt: null },
            select: {
                id: true,
                name: true,
                description: true,
                createdAt: true,
                _count: {
                    select: { members: true, projects: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return res.status(200).json({ organizations: orgs });

    } catch (error) {
        console.error('List orgs error:', error);
        return res.status(500).json({ error: 'Failed to list organizations' });
    }
};

// GET /api/orgs
// Get all organizations the authenticated user belongs to
exports.getUserOrgs = async (req, res) => {
    try {
        const userId = req.user.id;

        const memberships = await prisma.organizationMember.findMany({
            where: { userId },
            include: {
                organization: {
                    where: { deletedAt: null },
                    include: {
                        _count: { select: { projects: true, members: true } }
                    }
                }
            },
            orderBy: { joinedAt: 'desc' }
        });

        const orgs = memberships
            .filter(m => m.organization !== null)
            .map(m => ({
                ...m.organization,
                yourRole: m.role,
                joinedAt: m.joinedAt
            }));

        return res.status(200).json({ organizations: orgs });

    } catch (error) {
        console.error('Get user orgs error:', error);
        return res.status(500).json({ error: 'Failed to fetch organizations' });
    }
};

// GET /api/orgs/:id
// Get org details — members only
exports.getOrg = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const membership = await prisma.organizationMember.findUnique({
            where: { userId_organizationId: { userId, organizationId: id } }
        });

        if (!membership) {
            return res.status(403).json({ error: 'You must be a member of this organization to view it' });
        }

        const org = await prisma.organization.findFirst({
            where: { id, deletedAt: null },
            include: {
                members: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, createdAt: true }
                        }
                    }
                },
                projects: {
                    where: { deletedAt: null },
                    select: { id: true, name: true, description: true, createdAt: true }
                }
            }
        });

        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        return res.status(200).json({ organization: org, yourRole: membership.role });

    } catch (error) {
        console.error('Get org error:', error);
        return res.status(500).json({ error: 'Failed to fetch organization' });
    }
};

// POST /api/orgs/:id/request
// Submit a request to join an org
exports.requestJoinOrg = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const org = await prisma.organization.findFirst({
            where: { id, deletedAt: null }
        });

        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        const existingMembership = await prisma.organizationMember.findUnique({
            where: { userId_organizationId: { userId, organizationId: id } }
        });

        if (existingMembership) {
            return res.status(400).json({ error: 'You are already a member of this organization' });
        }

        const existingRequest = await prisma.orgJoinRequest.findUnique({
            where: { userId_organizationId: { userId, organizationId: id } }
        });

        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                return res.status(400).json({ error: 'You already have a pending request for this organization' });
            }
            // Allow re-request if previously rejected by updating the existing record
            const updated = await prisma.orgJoinRequest.update({
                where: { userId_organizationId: { userId, organizationId: id } },
                data: { status: 'pending', requestedAt: new Date(), resolvedAt: null }
            });
            return res.status(200).json({ message: 'Join request resubmitted', request: updated });
        }

        const request = await prisma.orgJoinRequest.create({
            data: { userId, organizationId: id }
        });

        return res.status(201).json({ message: 'Join request submitted', request });

    } catch (error) {
        console.error('Request join org error:', error);
        return res.status(500).json({ error: 'Failed to submit join request' });
    }
};

// GET /api/orgs/:id/requests
// Admin: view all pending join requests for this org
exports.getJoinRequests = async (req, res) => {
    try {
        const { id } = req.params;

        const requests = await prisma.orgJoinRequest.findMany({
            where: { organizationId: id, status: 'pending' },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { requestedAt: 'asc' }
        });

        return res.status(200).json({ requests });

    } catch (error) {
        console.error('Get join requests error:', error);
        return res.status(500).json({ error: 'Failed to fetch join requests' });
    }
};

// PATCH /api/orgs/:id/requests/:requestId
// Admin: approve or reject a join request
exports.resolveJoinRequest = async (req, res) => {
    try {
        const { id, requestId } = req.params;
        const { action } = req.body; // 'approve' | 'reject'

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ error: 'action must be "approve" or "reject"' });
        }

        const joinRequest = await prisma.orgJoinRequest.findFirst({
            where: { id: requestId, organizationId: id, status: 'pending' }
        });

        if (!joinRequest) {
            return res.status(404).json({ error: 'Pending request not found' });
        }

        if (action === 'approve') {
            await prisma.$transaction(async (tx) => {
                await tx.orgJoinRequest.update({
                    where: { id: requestId },
                    data: { status: 'approved', resolvedAt: new Date() }
                });

                await tx.organizationMember.create({
                    data: { userId: joinRequest.userId, organizationId: id, role: 'member' }
                });
            });

            return res.status(200).json({ message: 'Request approved, user added to organization' });
        }

        await prisma.orgJoinRequest.update({
            where: { id: requestId },
            data: { status: 'rejected', resolvedAt: new Date() }
        });

        return res.status(200).json({ message: 'Request rejected' });

    } catch (error) {
        console.error('Resolve join request error:', error);
        return res.status(500).json({ error: 'Failed to resolve join request' });
    }
};

// DELETE /api/orgs/:id/leave
// Leave an organization — cascades to all projects in that org
exports.leaveOrg = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const membership = await prisma.organizationMember.findUnique({
            where: { userId_organizationId: { userId, organizationId: id } }
        });

        if (!membership) {
            return res.status(404).json({ error: 'You are not a member of this organization' });
        }

        const adminCount = await prisma.organizationMember.count({
            where: { organizationId: id, role: 'admin' }
        });

        if (membership.role === 'admin' && adminCount === 1) {
            return res.status(400).json({
                error: 'Cannot leave: you are the only admin. Promote another member first or delete the organization.'
            });
        }

        await prisma.$transaction(async (tx) => {
            const projects = await tx.project.findMany({
                where: { organizationId: id, deletedAt: null },
                select: { id: true }
            });

            const projectIds = projects.map(p => p.id);

            if (projectIds.length > 0) {
                await tx.userProject.deleteMany({
                    where: { userId, projectId: { in: projectIds } }
                });
            }

            await tx.organizationMember.delete({
                where: { userId_organizationId: { userId, organizationId: id } }
            });
        });

        return res.status(200).json({ message: 'Successfully left organization' });

    } catch (error) {
        console.error('Leave org error:', error);
        return res.status(500).json({ error: 'Failed to leave organization' });
    }
};
