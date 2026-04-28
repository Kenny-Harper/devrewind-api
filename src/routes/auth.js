const express = require('express');
const router = express.Router();
const passport = require('passport');

router.get('/github', passport.authenticate('github', {
  scope: ['user:email', 'read:user', 'repo']
}));

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/auth/failed' }),
  async (req, res) => {
    try {
      const pool = require('../db');
      const accessToken = req.user.access_token;
      const userId = req.user.id;
      const username = req.user.username;

      // Generate stats inline so we don't need a session
      const statsController = require('../controllers/statsController');
      req.user = { id: userId, access_token: accessToken, username };
      
      res.redirect(`${process.env.CLIENT_URL}/wrapped/${username}`);
    } catch (err) {
      res.redirect(`${process.env.CLIENT_URL}?error=true`);
    }
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
