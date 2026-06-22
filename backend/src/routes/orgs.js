const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
    createOrg,
    listOrgs,
    getUserOrgs,
    getOrg,
    requestJoinOrg,
    getJoinRequests,
    resolveJoinRequest,
    leaveOrg
} = require('../controllers/orgs');

// GET /api/orgs/browse - List all orgs (authenticated, for discovery)
router.get('/browse', authenticate, listOrgs);

// GET /api/orgs - Get all orgs the user belongs to
router.get('/', authenticate, getUserOrgs);

// POST /api/orgs - Create org (user becomes admin)
router.post('/', authenticate, createOrg);

// GET /api/orgs/:id - Get org details (members only)
router.get('/:id', authenticate, getOrg);

// POST /api/orgs/:id/request - Submit a join request
router.post('/:id/request', authenticate, requestJoinOrg);

// GET /api/orgs/:id/requests - Admin: view pending join requests
router.get('/:id/requests', authenticate, authorize(['admin']), getJoinRequests);

// PATCH /api/orgs/:id/requests/:requestId - Admin: approve or reject a request
router.patch('/:id/requests/:requestId', authenticate, authorize(['admin']), resolveJoinRequest);

// DELETE /api/orgs/:id/leave - Leave an org
router.delete('/:id/leave', authenticate, leaveOrg);

module.exports = router;
