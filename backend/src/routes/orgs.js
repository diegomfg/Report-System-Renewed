const express = require('express');
const router = express.Router();

const authenticate = require("../middleware/authenticate");
const { createOrg, joinOrg, getOrg, getUserOrgs, leaveOrg } = require("../controllers/orgs");

// GET /api/orgs - Get all user's organizations
router.get('/', authenticate, getUserOrgs);

// POST /api/orgs - Create organization
router.post('/', authenticate, createOrg);

// GET /api/orgs/:id - Get org details (members only)
router.get('/:id', authenticate, getOrg);

// POST /api/orgs/:id/join - Join organization
router.post('/:id/join', authenticate, joinOrg);

// DELETE /api/orgs/:id/leave - Leave organization
router.delete('/:id/leave', authenticate, leaveOrg);

module.exports = router;
