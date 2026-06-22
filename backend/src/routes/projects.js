const express = require('express');
const router = express.Router({ mergeParams: true }); // exposes :orgId from parent route

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
    createProject,
    listProjects,
    getProject,
    deleteProject,
    addMember,
    removeMember,
    requestAccess,
    getAccessRequests,
    resolveAccessRequest,
    leaveProject
} = require('../controllers/projects');

const adminOnly  = [authenticate, authorize(['admin'], 'orgId')];
const memberOnly = [authenticate, authorize(['admin', 'member'], 'orgId')];

// POST   /api/orgs/:orgId/projects           — create project
router.post('/', ...adminOnly, createProject);

// GET    /api/orgs/:orgId/projects           — list all org projects (with user's access status)
router.get('/', ...memberOnly, listProjects);

// GET    /api/orgs/:orgId/projects/:projectId — project details + member list with badges
router.get('/:projectId', ...memberOnly, getProject);

// DELETE /api/orgs/:orgId/projects/:projectId — soft delete
router.delete('/:projectId', ...adminOnly, deleteProject);

// POST   /api/orgs/:orgId/projects/:projectId/members           — directly add a user
router.post('/:projectId/members', ...adminOnly, addMember);

// DELETE /api/orgs/:orgId/projects/:projectId/members/:userId   — remove a user
router.delete('/:projectId/members/:userId', ...adminOnly, removeMember);

// POST   /api/orgs/:orgId/projects/:projectId/request           — member requests access
router.post('/:projectId/request', ...memberOnly, requestAccess);

// GET    /api/orgs/:orgId/projects/:projectId/requests          — admin views pending requests
router.get('/:projectId/requests', ...adminOnly, getAccessRequests);

// PATCH  /api/orgs/:orgId/projects/:projectId/requests/:requestId — admin approves/rejects
router.patch('/:projectId/requests/:requestId', ...adminOnly, resolveAccessRequest);

// DELETE /api/orgs/:orgId/projects/:projectId/leave             — leave project
router.delete('/:projectId/leave', ...memberOnly, leaveProject);

module.exports = router;
