const express = require('express');
const router = express.Router({ mergeParams: true });

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
    listComments,
    createComment,
    editComment,
    deleteComment
} = require('../controllers/comments');

const memberOnly = [authenticate, authorize(['admin', 'member'], 'orgId')];

// GET    /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments
router.get('/', ...memberOnly, listComments);

// POST   /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments
router.post('/', ...memberOnly, createComment);

// PATCH  /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments/:commentId
router.patch('/:commentId', ...memberOnly, editComment);

// DELETE /api/orgs/:orgId/projects/:projectId/reports/:reportId/comments/:commentId
router.delete('/:commentId', ...memberOnly, deleteComment);

module.exports = router;
