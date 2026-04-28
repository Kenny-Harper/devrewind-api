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
      const accessToken = req.user.access_token;
      const userId = req.user.id;
      const username = req.user.username;

      const reposResponse = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      const repos = await reposResponse.json();

      const languageCount = {};
      repos.forEach(repo => {
        if (repo.language) languageCount[repo.language] = (languageCount[repo.language] || 0) + 1;
      });
      const topLanguages = Object.entries(languageCount).sort((a,b) => b[1]-a[1]).slice(0,5).map(([language, count]) => ({ language, count }));

      const graphqlResponse = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `query { viewer { contributionsCollection { totalCommitContributions totalPullRequestContributions contributionCalendar { totalContributions weeks { contributionDays { contributionCount date } } } } pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { name description url stargazerCount primaryLanguage { name } homepageUrl object(expression: "HEAD:README.md") { ... on Blob { text } } } } } } }` })
      });

      const graphqlData = await graphqlResponse.json();
      const contributions = graphqlData.data.viewer.contributionsCollection;

      const pinnedRepos = graphqlData.data.viewer.pinnedItems.nodes.map(repo => {
        let readmeImage = null;
        if (repo.object?.text) {
          const imageMatch = repo.object.text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)|src="(https?:\/\/[^\s"]+)"/);
          const readmeImageUrl = imageMatch ? (imageMatch[1] || imageMatch[2]) : null;
          if (readmeImageUrl) readmeImage = readmeImageUrl;
        }
        return { name: repo.name, description: repo.description, url: repo.url, homepageUrl: repo.homepageUrl, stargazerCount: repo.stargazerCount, primaryLanguage: repo.primaryLanguage, readmeImage };
      });

      const allDays = contributions.contributionCalendar.weeks.flatMap(week => week.contributionDays);
      let bestStreak = 0, tempStreak = 0;
      allDays.forEach(day => { if (day.contributionCount > 0) { tempStreak++; bestStreak = Math.max(bestStreak, tempStreak); } else { tempStreak = 0; } });

      const dayTotals = [0,0,0,0,0,0,0];
      const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      allDays.forEach(day => { dayTotals[new Date(day.date).getDay()] += day.contributionCount; });
      const mostActiveDay = dayNames[dayTotals.indexOf(Math.max(...dayTotals))];

      const stats = {
        totalContributions: contributions.contributionCalendar.totalContributions,
        totalCommits: contributions.totalCommitContributions,
        totalPullRequests: contributions.totalPullRequestContributions,
        bestStreak, mostActiveDay, topLanguages, pinnedRepos,
        totalRepos: repos.length,
        contributionCalendar: contributions.contributionCalendar.weeks
      };

      await pool.query(
        `INSERT INTO user_stats (user_id, stats_data, generated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET stats_data = $2, generated_at = NOW()`,
        [userId, JSON.stringify(stats)]
      );

      res.redirect(`${process.env.CLIENT_URL}/wrapped/${username}`);
    } catch (err) {
      console.error('Error in callback:', err);
      res.redirect(`${process.env.CLIENT_URL}/wrapped/${req.user.username}`);
    }
  }
);

router.get('/failed', (req, res) => {
  res.status(401).json({ error: 'Authentication failed' });
});

router.get('/logout', (req, res) => {
  req.logout(() => { res.json({ message: 'Logged out successfully' }); });
});

router.get('/me', (req, res) => {
  if (req.isAuthenticated()) { res.json({ user: req.user }); }
  else { res.status(401).json({ error: 'Not authenticated' }); }
});

module.exports = router;
