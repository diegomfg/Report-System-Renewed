const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// POST /api/orgs
// Creates org and adds creator as admin (via OrganizationMember)
exports.createOrg = async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id; // From authenticate middleware

        // Validate org name
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Organization name is required' });
        }

        // Transaction: Create org + add user as admin member
        const result = await prisma.$transaction(async (tx) => {
            // Create organization
            const org = await tx.organization.create({
                data: {
                    name: name.trim(),
                    description: description?.trim() || null
                }
            });

            // Add user as admin of this org
            await tx.organizationMember.create({
                data: {
                    userId,
                    organizationId: org.id,
                    role: 'admin'
                }
            });

            return org;
        });

        return res.status(201).json({
            message: 'Organization created successfully',
            organization: result
        });

    } catch (error) {
        console.error('Create org error:', error);
        return res.status(500).json({
            error: 'Failed to create organization',
            message: error.message
        });
    }
};

// POST /api/orgs/:id/join
// Allows user to join an organization as member
exports.joinOrg = async (req, res) => {
    try {
        const { id } = req.params; // org ID from URL
        const userId = req.user.id;

        // Check if org exists and is not deleted
        const org = await prisma.organization.findFirst({
            where: {
                id,
                deletedAt: null
            }
        });

        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Check if user is already a member
        const existingMembership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: id
                }
            }
        });

        if (existingMembership) {
            return res.status(400).json({
                error: 'You are already a member of this organization'
            });
        }

        // Add user as member
        await prisma.organizationMember.create({
            data: {
                userId,
                organizationId: id,
                role: 'member'
            }
        });

        return res.status(200).json({
            message: 'Successfully joined organization',
            organization: org
        });

    } catch (error) {
        console.error('Join org error:', error);
        return res.status(500).json({ error: 'Failed to join organization' });
    }
};

// GET /api/orgs/:id
// Get organization details (members only)
exports.getOrg = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if user is a member of this org
        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: id
                }
            }
        });

        if (!membership) {
            return res.status(403).json({
                error: 'You must be a member of this organization to view it'
            });
        }

        // Fetch org with members and projects
        const org = await prisma.organization.findFirst({
            where: {
                id,
                deletedAt: null
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                createdAt: true
                            }
                        }
                    }
                },
                projects: {
                    where: { deletedAt: null },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        createdAt: true
                    }
                }
            }
        });

        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        return res.status(200).json({
            organization: org,
            yourRole: membership.role
        });

    } catch (error) {
        console.error('Get org error:', error);
        return res.status(500).json({ error: 'Failed to fetch organization' });
    }
};

// GET /api/orgs
// Get all organizations the user belongs to
exports.getUserOrgs = async (req, res) => {
    try {
        const userId = req.user.id;

        const memberships = await prisma.organizationMember.findMany({
            where: {
                userId
            },
            include: {
                organization: {
                    where: {
                        deletedAt: null
                    },
                    include: {
                        _count: {
                            select: {
                                projects: true,
                                members: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                joinedAt: 'desc'
            }
        });

        // Filter out null organizations (soft-deleted)
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

// DELETE /api/orgs/:id/leave
// Leave an organization (cascades to projects)
exports.leaveOrg = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if user is a member
        const membership = await prisma.organizationMember.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId: id
                }
            }
        });

        if (!membership) {
            return res.status(404).json({
                error: 'You are not a member of this organization'
            });
        }

        // Check if user is the only admin
        const adminCount = await prisma.organizationMember.count({
            where: {
                organizationId: id,
                role: 'admin'
            }
        });

        if (membership.role === 'admin' && adminCount === 1) {
            return res.status(400).json({
                error: 'Cannot leave: you are the only admin. Please promote another member or delete the organization.'
            });
        }

        // Transaction: Remove from org + all projects in that org
        await prisma.$transaction(async (tx) => {
            // Get all projects in this org
            const projects = await tx.project.findMany({
                where: {
                    organizationId: id,
                    deletedAt: null
                },
                select: { id: true }
            });

            const projectIds = projects.map(p => p.id);

            // Remove user from all projects in this org
            if (projectIds.length > 0) {
                await tx.userProject.deleteMany({
                    where: {
                        userId,
                        projectId: { in: projectIds }
                    }
                });
            }

            // Remove organization membership
            await tx.organizationMember.delete({
                where: {
                    userId_organizationId: {
                        userId,
                        organizationId: id
                    }
                }
            });
        });

        return res.status(200).json({
            message: 'Successfully left organization'
        });

    } catch (error) {
        console.error('Leave org error:', error);
        return res.status(500).json({ error: 'Failed to leave organization' });
    }
};
