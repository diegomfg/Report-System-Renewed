const express = require('express');
const router = express.Router({ mergeParams: true }); // exposes :orgId and :projectId

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
    createReport,
    listReports,
    getReport,
    updateReport,
    deleteReport,
    addAssignee,
    removeAssignee,
    addReviewer,
    removeReviewer
} = require('../controllers/reports');

const memberOnly = [authenticate, authorize(['admin', 'member'], 'orgId')];

// POST   /api/orgs/:orgId/projects/:projectId/reports
router.post('/', ...memberOnly, createReport);

// GET    /api/orgs/:orgId/projects/:projectId/reports?severity=&status=
router.get('/', ...memberOnly, listReports);

// GET    /api/orgs/:orgId/projects/:projectId/reports/:reportId
router.get('/:reportId', ...memberOnly, getReport);

// PATCH  /api/orgs/:orgId/projects/:projectId/reports/:reportId
router.patch('/:reportId', ...memberOnly, updateReport);

// DELETE /api/orgs/:orgId/projects/:projectId/reports/:reportId
router.delete('/:reportId', ...memberOnly, deleteReport);

// POST   /api/orgs/:orgId/projects/:projectId/reports/:reportId/assignees
router.post('/:reportId/assignees', ...memberOnly, addAssignee);

// DELETE /api/orgs/:orgId/projects/:projectId/reports/:reportId/assignees/:userId
router.delete('/:reportId/assignees/:userId', ...memberOnly, removeAssignee);

// POST   /api/orgs/:orgId/projects/:projectId/reports/:reportId/reviewers
router.post('/:reportId/reviewers', ...memberOnly, addReviewer);

// DELETE /api/orgs/:orgId/projects/:projectId/reports/:reportId/reviewers/:userId
router.delete('/:reportId/reviewers/:userId', ...memberOnly, removeReviewer);

module.exports = router;
