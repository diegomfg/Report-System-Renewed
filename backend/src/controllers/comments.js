const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findReport(reportId, projectId, orgId) {
    return prisma.report.findFirst({
        where: { id: reportId, projectId, organizationId: orgId, deletedAt: null }
    });
}

async function canComment(userId, reportId, isAdmin) {
    if (isAdmin) return true;

    const report = await prisma.report.findUnique({
        where: { id: reportId },
        select: {
            createdById: true,
            assignees: { where: { userId }, select: { userId: true } },
            reviewers: { where: { userId }, select: { userId: true } }
        }
    });

    if (!report) return false;
    if (report.createdById === userId) return true;
    if (report.assignees.length > 0) return true;
    if (report.reviewers.length > 0) return true;
    return false;
}

function sanitize(comment) {
    if (!comment.deletedAt) return comment;
    return {
        id: comment.id,
        body: '[deleted]',
        author: null,
        parentId: comment.parentId ?? null,
        deletedAt: comment.deletedAt,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        ...(comment.replies ? { replies: comment.replies.map(sanitize) } : {})
    };
}

// GET /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments
exports.listComments = async (req, res) => {
    try {
        const { orgId, projectId, reportId } = req.params;

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const topLevel = await prisma.comment.findMany({
            where: { reportId, parentId: null },
            include: {
                author: { select: { id: true, name: true } },
                replies: {
                    include: { author: { select: { id: true, name: true } } },
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        return res.status(200).json({ comments: topLevel.map(sanitize) });

    } catch (error) {
        console.error('List comments error:', error);
        return res.status(500).json({ error: 'Failed to list comments' });
    }
};

// POST /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments
exports.createComment = async (req, res) => {
    try {
        const { orgId, projectId, reportId } = req.params;
        const userId = req.user.id;
        const { body, parentId } = req.body;

        if (!body || !body.trim()) return res.status(400).json({ error: 'Body is required' });

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const allowed = await canComment(userId, reportId, req.membership.role === 'admin');
        if (!allowed) return res.status(403).json({ error: 'You are not allowed to comment on this report' });

        if (parentId) {
            const parent = await prisma.comment.findUnique({
                where: { id: parentId },
                select: { reportId: true, parentId: true, deletedAt: true }
            });
            if (!parent || parent.reportId !== reportId) {
                return res.status(404).json({ error: 'Parent comment not found' });
            }
            if (parent.parentId) {
                return res.status(400).json({ error: 'Replies cannot be nested more than one level deep' });
            }
            if (parent.deletedAt) {
                return res.status(400).json({ error: 'Cannot reply to a deleted comment' });
            }
        }

        const comment = await prisma.comment.create({
            data: { body: body.trim(), reportId, authorId: userId, parentId: parentId ?? null },
            include: { author: { select: { id: true, name: true } } }
        });

        return res.status(201).json({ message: 'Comment created', comment });

    } catch (error) {
        console.error('Create comment error:', error);
        return res.status(500).json({ error: 'Failed to create comment' });
    }
};

// PATCH /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments/:commentId
exports.editComment = async (req, res) => {
    try {
        const { orgId, projectId, reportId, commentId } = req.params;
        const userId = req.user.id;
        const { body } = req.body;

        if (!body || !body.trim()) return res.status(400).json({ error: 'Body is required' });

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const comment = await prisma.comment.findUnique({ where: { id: commentId } });

        if (!comment || comment.reportId !== reportId) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        if (comment.deletedAt) {
            return res.status(400).json({ error: 'Cannot edit a deleted comment' });
        }
        if (comment.authorId !== userId) {
            return res.status(403).json({ error: 'Only the comment author can edit this comment' });
        }

        const updated = await prisma.comment.update({
            where: { id: commentId },
            data: { body: body.trim() },
            include: { author: { select: { id: true, name: true } } }
        });

        return res.status(200).json({ message: 'Comment updated', comment: updated });

    } catch (error) {
        console.error('Edit comment error:', error);
        return res.status(500).json({ error: 'Failed to edit comment' });
    }
};

// DELETE /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments/:commentId
exports.deleteComment = async (req, res) => {
    try {
        const { orgId, projectId, reportId, commentId } = req.params;
        const userId = req.user.id;

        const report = await findReport(reportId, projectId, orgId);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        const comment = await prisma.comment.findUnique({ where: { id: commentId } });

        if (!comment || comment.reportId !== reportId) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        if (comment.deletedAt) {
            return res.status(400).json({ error: 'Comment is already deleted' });
        }

        const isAdmin  = req.membership.role === 'admin';
        const isAuthor = comment.authorId === userId;

        if (!isAdmin && !isAuthor) {
            return res.status(403).json({ error: 'Only the comment author or an admin can delete this comment' });
        }

        await prisma.comment.update({
            where: { id: commentId },
            data: { deletedAt: new Date() }
        });

        return res.status(200).json({ message: 'Comment deleted' });

    } catch (error) {
        console.error('Delete comment error:', error);
        return res.status(500).json({ error: 'Failed to delete comment' });
    }
};
