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

/*
 * AUTHENTICATION FLOW RECAP (plain English)
 *
 * This is the authentication brain of DevRewind.
 *
 * When someone visits DevRewind and clicks "Login with GitHub", your Express
 * server redirects them to GitHub. GitHub asks the user for permission, and
 * when they say yes, GitHub sends them back to your app with an access token.
 *
 * This file catches that moment:
 * - Checks if the user already exists in your PostgreSQL database
 * - If yes: updates their access token (it can change over time)
 * - If no: creates a brand new user row in the database
 *
 * Every future request then uses the session to remember who they are,
 * so they don't have to log in again on every page visit.
 */

const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const pool = require('../db');

passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  // Uses BASE_URL in production (Railway), falls back to localhost in development
  callbackURL: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/github/callback`

}, async (accessToken, refreshToken, profile, done) => {
  try {
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE github_id = $1',
      [profile.id]
    );

    if (existingUser.rows.length > 0) {
      const updatedUser = await pool.query(
        'UPDATE users SET access_token = $1, updated_at = NOW() WHERE github_id = $2 RETURNING *',
        [accessToken, profile.id]
      );
      return done(null, updatedUser.rows[0]);
    }

    const newUser = await pool.query(
      'INSERT INTO users (github_id, username, avatar_url, access_token) VALUES ($1, $2, $3, $4) RETURNING *',
      [profile.id, profile.username, profile.photos[0].value, accessToken]
    );

    return done(null, newUser.rows[0]);

  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;