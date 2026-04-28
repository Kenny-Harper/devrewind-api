const express = require('express');
const router = express.Router();
const passport = require('passport');
const pool = require('../db');

router.get('/github', passport.authenticate('github', {
  scope: ['user:email', 'read:user', 'repo']
}));

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/auth/failed' }),
  async (req, res) => {
    try {
      const { getGitHubStats } = require('../controllers/statsController');
      await new Promise((resolve, reject) => {
        const fakeRes = {
          json: resolve,
          status: () => ({ json: reject })
        };
        getGitHubStats(req, fakeRes);
      });
    } catch (err) {
      console.error('Stats generation failed:', err);
    }
    res.redirect(`${process.env.CLIENT_URL}/wrapped/${req.user.username}`);
  }
);

router.get('/failed', (req, res) => {
  res.status(401).json({ error: 'Authentication failed' });
});

router.get('/logout', (req, res) => {
  req.logout(() => {
    res.json({ message: 'Logged out successfully' });
  });
});

router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

module.exports = router;
