/*
 * WHAT THIS FILE DOES (plain English)
 *
 * This is where we call GitHub's API to fetch real data about a user's
 * coding activity. We use the access token stored during login to make
 * authenticated requests to GitHub on their behalf.
 *
 * We fetch:
 * - Their repositories (languages, stars, descriptions)
 * - Their contribution activity (commits over time)
 * - Their pinned/top repositories to show as project cards
 *
 * This data gets processed and stored in our database so we can
 * generate their DevRewind card without hitting GitHub's API every time.
 *
 * KEY CONCEPTS:
 * - Access token = proves to GitHub we have permission to read this user's data
 * - Rate limiting = GitHub only allows a certain number of API calls per hour
 * - GraphQL      = GitHub's advanced API that lets us fetch exactly what we need
 */

const pool = require('../db');

// Fetch a user's GitHub stats using their stored access token
const getGitHubStats = async (req, res) => {
  try {
    // Get the logged in user from the session
    const userId = req.user.id;
    const accessToken = req.user.access_token;

    // Fetch user's repositories from GitHub API
    const reposResponse = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const repos = await reposResponse.json();

    // Calculate language breakdown across all repos
    const languageCount = {};
    repos.forEach(repo => {
      if (repo.language) {
        languageCount[repo.language] = (languageCount[repo.language] || 0) + 1;
      }
    });

    // Sort languages by frequency
    const topLanguages = Object.entries(languageCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([language, count]) => ({ language, count }));

    // Fetch contribution data using GitHub GraphQL API
    const graphqlResponse = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `
          query {
            viewer {
              contributionsCollection {
                totalCommitContributions
                totalPullRequestContributions
                contributionCalendar {
                  totalContributions
                  weeks {
                    contributionDays {
                      contributionCount
                      date
                    }
                  }
                }
              }
              pinnedItems(first: 6, types: REPOSITORY) {
                nodes {
                  ... on Repository {
                    name
                    description
                    url
                    stargazerCount
                    primaryLanguage {
                      name
                    }
                    homepageUrl
                  }
                }
              }
            }
          }
        `
      })
    });

    const graphqlData = await graphqlResponse.json();
    const contributions = graphqlData.data.viewer.contributionsCollection;
    const pinnedRepos = graphqlData.data.viewer.pinnedItems.nodes;

    // Calculate best streak from contribution calendar
    const allDays = contributions.contributionCalendar.weeks
      .flatMap(week => week.contributionDays);

    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;

    allDays.forEach(day => {
      if (day.contributionCount > 0) {
        tempStreak++;
        bestStreak = Math.max(bestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    });

    // Find most active day of the week
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    allDays.forEach(day => {
      const dayIndex = new Date(day.date).getDay();
      dayTotals[dayIndex] += day.contributionCount;
    });

    const mostActiveDay = dayNames[dayTotals.indexOf(Math.max(...dayTotals))];

    // Build the stats object
    const stats = {
      totalContributions: contributions.contributionCalendar.totalContributions,
      totalCommits: contributions.totalCommitContributions,
      totalPullRequests: contributions.totalPullRequestContributions,
      bestStreak,
      mostActiveDay,
      topLanguages,
      pinnedRepos,
      totalRepos: repos.length,
      contributionCalendar: contributions.contributionCalendar.weeks
    };

    // Save stats to database
    await pool.query(
      `INSERT INTO user_stats (user_id, stats_data, generated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET stats_data = $2, generated_at = NOW()`,
      [userId, JSON.stringify(stats)]
    );

    res.json({ success: true, stats });

  } catch (err) {
    console.error('Error fetching GitHub stats:', err);
    res.status(500).json({ error: 'Failed to fetch GitHub stats' });
  }
};

// Get stored stats for a user's public profile page
const getPublicStats = async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      `SELECT us.stats_data, u.username, u.avatar_url
       FROM user_stats us
       JOIN users u ON u.id = us.user_id
       WHERE u.username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No stats found for this user' });
    }

    res.json({
      username: result.rows[0].username,
      avatar_url: result.rows[0].avatar_url,
      stats: result.rows[0].stats_data
    });

  } catch (err) {
    console.error('Error fetching public stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

module.exports = { getGitHubStats, getPublicStats };