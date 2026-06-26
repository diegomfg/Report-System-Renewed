const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES   = ['open', 'in_progress', 'resolved'];

async function findReport(reportId, projectId, orgId) {
    return prisma.report.findFirst({
        where: { id: reportId, projectId, organizationId: orgId, deletedAt: null }
    });
}

// POST /api/orgs/:orgId/projects/:projectId/reports
// Project members only: create a report
exports.createReport = async (req, res) => {
    try {
        const { orgId, projectId } = req.params;
        const userId = req.user.id;
        const { title, description, severity } = req.body;

        if (!title || !title.trim())       return res.status(400).json({ error: 'Title is required' });
        if (!description || !description.trim()) return res.status(400).json({ error: 'Description is required' });
        if (!severity || !VALID_SEVERITIES.includes(severity)) {
            return res.status(400).json({ error: `Severity must be one of: ${VALID_SEVERITIES.join(', ')}` });
        }

        const project = await prisma.project.findFirst({
            where: { id: projectId, organizationId: orgId, deletedAt: null }
        });
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const projectMembership = await prisma.userProject.findUnique({
            where: { userId_projectId: { userId, projectId } }
        });
        if (!projectMembership) {
            return res.status(403).json({ error: 'You must be a project member to create reports' });
        }

        const report = await prisma.report.create({
            data: {
                title: title.trim(),
                description: description.trim(),
                severity,
                createdById: userId,
                projectId,
                organizationId: orgId
            }
        });

        return res.status(201).json({ message: 'Report created', report });

    } catch (error) {
        console.error('Create report error:', error);
        return res.status(500).json({ error: 'Failed to create report' });
    }
};

// GET /api/orgs/:orgId/projects/:projectId/reports?severity=&status=
// Any org member: list reports with optional filters
exports.listReports = async (req, res) => {
    try {
        const { orgId, projectId } = req.params;
        const { severity, status } = req.query;

        const where = { projectId, organizationId: orgId, deletedAt: null };
        if (severity && VALID_SEVERITIES.includes(severity)) where.severity = severity;
        if (status && VALID_STATUSES.includes(status))       where.status   = status;

        const reports = await prisma.report.findMany({
            where,
            include: {
                createdBy: { select: { id: true, name: true } },
                _count: { select: { assignees: true, reviewers: true, comments: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return res.status(200).json({ reports });

    } catch (error) {
        console.error('List reports error:', error);
        return res.status(500).json({ error: 'Failed to list reports' });
    }
};

// GET /api/orgs/:orgId/projects/:projectId/reports/:reportId
// Any org member: full report detail with assignees, reviewers, and comments
exports.getReport = async (req, res) => {
    try {
        const { orgId, projectId, reportId } = req.params;

        const report = await prisma.report.findFirst({
            where: { id: reportId, projectId, organizationId: orgId, deletedAt: null },
            include: {
                createdBy: { select: { id: true, name: true, email: true } },
                assignees: {
                    include: { user: { select: { id: true, name: true, email: true } } }
                },
                reviewers: {
                    include: { user: { select: { id: true, name: true, email: true } } }
                },
                comments: {
                    include: { author: { select: { id: true, name: true } } },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        if (!report) return res.status(404).json({ error: 'Report not found' });

        return res.status(200).json({ report });

    } catch (error) {
        console.error('Get report error:', error);
        return res.status(500).json({ error: 'Failed to fetch report' });
    }
};

// PATCH /api/orgs/:orgId/projects/:projectId/reports/:reportId
// Project members only: update any subset of fields
exports.updateReport = async (req, res) => {
    try {
        const { orgId, projectId, reportId } = req.params;
        const userId = req.user.id;
        const { title, description, severity, status } = req.body;

        const projectMembership = await prisma.userProject.findUnique({
            where: { userId_projectId: { userId, projectId } }
        });
        if (!projectMembership) {
            return res.status(403).json({ error: 'You must be a project member to update reports' });
        }

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const updates = {};

        if (title !== undefined) {
            if (!title.trim()) return res.status(400).json({ error: 'Title cannot be empty' });
            updates.title = title.trim();
        }
        if (description !== undefined) {
            if (!description.trim()) return res.status(400).json({ error: 'Description cannot be empty' });
            updates.description = description.trim();
        }
        if (severity !== undefined) {
            if (!VALID_SEVERITIES.includes(severity)) {
                return res.status(400).json({ error: `Severity must be one of: ${VALID_SEVERITIES.join(', ')}` });
            }
            updates.severity = severity;
        }
        if (status !== undefined) {
            if (!VALID_STATUSES.includes(status)) {
                return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
            }
            updates.status = status;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        const updated = await prisma.report.update({
            where: { id: reportId },
            data: updates
        });

        return res.status(200).json({ message: 'Report updated', report: updated });

    } catch (error) {
        console.error('Update report error:', error);
        return res.status(500).json({ error: 'Failed to update report' });
    }
};

// DELETE /api/orgs/:orgId/projects/:projectId/reports/:reportId
// Admin or creator: soft delete
exports.deleteReport = async (req, res) => {
    try {
        const { orgId, projectId, reportId } = req.params;

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const isAdmin   = req.membership.role === 'admin';
        const isCreator = report.createdById === req.user.id;

        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: 'Only the report creator or an admin can delete this report' });
        }

        await prisma.report.update({
            where: { id: reportId },
            data: { deletedAt: new Date() }
        });

        return res.status(200).json({ message: 'Report deleted' });

    } catch (error) {
        console.error('Delete report error:', error);
        return res.status(500).json({ error: 'Failed to delete report' });
    }
};

// POST /api/orgs/:orgId/projects/:projectId/reports/:reportId/assignees
// Admin or creator: add an assignee — must be a project member
exports.addAssignee = async (req, res) => {
    try {
        const { orgId, projectId, reportId } = req.params;
        const { userId } = req.body;

        if (!userId) return res.status(400).json({ error: 'userId is required' });

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const isAdmin   = req.membership.role === 'admin';
        const isCreator = report.createdById === req.user.id;
        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: 'Only the report creator or an admin can manage assignees' });
        }

        const projectMembership = await prisma.userProject.findUnique({
            where: { userId_projectId: { userId, projectId } }
        });
        if (!projectMembership) {
            return res.status(400).json({ error: 'User must be a project member to be assigned' });
        }

        const existing = await prisma.reportAssignee.findUnique({
            where: { reportId_userId: { reportId, userId } }
        });
        if (existing) return res.status(400).json({ error: 'User is already an assignee' });

        await prisma.reportAssignee.create({ data: { reportId, userId } });

        return res.status(201).json({ message: 'Assignee added' });

    } catch (error) {
        console.error('Add assignee error:', error);
        return res.status(500).json({ error: 'Failed to add assignee' });
    }
};

// DELETE /api/orgs/:orgId/projects/:projectId/reports/:reportId/assignees/:userId
// Admin or creator: remove an assignee
exports.removeAssignee = async (req, res) => {
    try {
        const { orgId, projectId, reportId, userId } = req.params;

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const isAdmin   = req.membership.role === 'admin';
        const isCreator = report.createdById === req.user.id;
        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: 'Only the report creator or an admin can manage assignees' });
        }

        const existing = await prisma.reportAssignee.findUnique({
            where: { reportId_userId: { reportId, userId } }
        });
        if (!existing) return res.status(404).json({ error: 'User is not an assignee' });

        await prisma.reportAssignee.delete({
            where: { reportId_userId: { reportId, userId } }
        });

        return res.status(200).json({ message: 'Assignee removed' });

    } catch (error) {
        console.error('Remove assignee error:', error);
        return res.status(500).json({ error: 'Failed to remove assignee' });
    }
};

// POST /api/orgs/:orgId/projects/:projectId/reports/:reportId/reviewers
// Admin or creator: add a reviewer — must be an org member
exports.addReviewer = async (req, res) => {
    try {
        const { orgId, projectId, reportId } = req.params;
        const { userId } = req.body;

        if (!userId) return res.status(400).json({ error: 'userId is required' });

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const isAdmin   = req.membership.role === 'admin';
        const isCreator = report.createdById === req.user.id;
        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: 'Only the report creator or an admin can manage reviewers' });
        }

        const orgMembership = await prisma.organizationMember.findUnique({
            where: { userId_organizationId: { userId, organizationId: orgId } }
        });
        if (!orgMembership) {
            return res.status(400).json({ error: 'User must be an org member to be a reviewer' });
        }

        const existing = await prisma.reportReviewer.findUnique({
            where: { reportId_userId: { reportId, userId } }
        });
        if (existing) return res.status(400).json({ error: 'User is already a reviewer' });

        await prisma.reportReviewer.create({ data: { reportId, userId } });

        return res.status(201).json({ message: 'Reviewer added' });

    } catch (error) {
        console.error('Add reviewer error:', error);
        return res.status(500).json({ error: 'Failed to add reviewer' });
    }
};

// DELETE /api/orgs/:orgId/projects/:projectId/reports/:reportId/reviewers/:userId
// Admin or creator: remove a reviewer
exports.removeReviewer = async (req, res) => {
    try {
        const { orgId, projectId, reportId, userId } = req.params;

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const isAdmin   = req.membership.role === 'admin';
        const isCreator = report.createdById === req.user.id;
        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: 'Only the report creator or an admin can manage reviewers' });
        }

        const existing = await prisma.reportReviewer.findUnique({
            where: { reportId_userId: { reportId, userId } }
        });
        if (!existing) return res.status(404).json({ error: 'User is not a reviewer' });

        await prisma.reportReviewer.delete({
            where: { reportId_userId: { reportId, userId } }
        });

        return res.status(200).json({ message: 'Reviewer removed' });

    } catch (error) {
        console.error('Remove reviewer error:', error);
        return res.status(500).json({ error: 'Failed to remove reviewer' });
    }
};
