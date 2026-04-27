/*
 * WHAT THIS FILE DOES (plain English)
 *
 * When a user clicks "Login with GitHub" they get sent to GitHub's website.
 * GitHub asks "do you allow DevRewind to see your profile?" — if they say yes,
 * GitHub sends them back to your app with an access token.
 *
 * This file catches that moment, checks if the user already exists in your
 * database, and either creates them or updates them. Every future request
 * then uses the session to remember who they are without logging in again.
 *
 * KEY CONCEPTS:
 * - Strategy = the method of authentication (GitHub OAuth in this case)
 * - Access token = a key that lets us call GitHub's API as that user
 * - serialize = what we store in the session (just the user's database ID)
 * - deserialize = how we turn that ID back into a full user on each request
 */

// Import passport - the authentication library
const passport = require('passport');

// Import the GitHub strategy - this is what tells passport HOW to authenticate with GitHub
const GitHubStrategy = require('passport-github2').Strategy;

// Import our database connection so we can save/find users
const pool = require('../db');

// Tell passport to use the GitHub OAuth strategy
passport.use(new GitHubStrategy({
  // Your GitHub OAuth app credentials from .env
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  // The URL GitHub redirects to after the user logs in
  callbackURL: 'http://localhost:3000/auth/github/callback'

// This function runs after GitHub confirms the user is who they say they are
// accessToken = a key we use to call GitHub's API on their behalf
// profile = the user's GitHub profile data (username, avatar etc)
// done = a function we call to tell passport we're finished
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if this GitHub user has logged in before
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE github_id = $1',
      [profile.id]
    );

    if (existingUser.rows.length > 0) {
      // User exists - update their access token (it can change) and return them
      const updatedUser = await pool.query(
        'UPDATE users SET access_token = $1, updated_at = NOW() WHERE github_id = $2 RETURNING *',
        [accessToken, profile.id]
      );
      return done(null, updatedUser.rows[0]);
    }

    // New user - insert them into the database for the first time
    const newUser = await pool.query(
      'INSERT INTO users (github_id, username, avatar_url, access_token) VALUES ($1, $2, $3, $4) RETURNING *',
      [profile.id, profile.username, profile.photos[0].value, accessToken]
    );

    return done(null, newUser.rows[0]);

  } catch (err) {
    // Something went wrong - pass the error to passport
    return done(err, null);
  }
}));

// serializeUser - when a user logs in, what do we store in the session?
// We just store their database ID - small and simple
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// deserializeUser - on every request, convert that session ID back into a full user object
// This is how req.user gets populated on every request
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;