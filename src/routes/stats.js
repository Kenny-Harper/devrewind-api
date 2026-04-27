/*
 * WHAT THIS FILE DOES (plain English)
 *
 * Defines the API endpoints for fetching GitHub stats.
 * /api/stats/generate  - fetches fresh stats from GitHub for logged in user
 * /api/stats/:username - returns stored stats for any user's public profile
 */

const express = require('express');
const router = express.Router();
const { getGitHubStats, getPublicStats } = require('../controllers/statsController');

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Please log in first' });
};

// Generate stats for the logged in user
router.get('/generate', isAuthenticated, getGitHubStats);

// Get public stats for any username
router.get('/:username', getPublicStats);

module.exports = router;