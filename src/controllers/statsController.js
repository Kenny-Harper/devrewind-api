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
 * - Their pinned repositories with README images to show as project cards
 *
 * Image priority for each project card:
 * 1. First image found in the repo's README (markdown or HTML format)
 * 2. Screenshot of the live deployed URL via microlink
 * 3. Generic GitHub card as fallback
 *
 * Live Demo URL priority:
 * 1. Parsed from ## Live Demo section in README
 * 2. homepageUrl from GitHub repo settings
 * 3. Nothing shown if neither exists
 */

const pool = require('../db');

const getGitHubStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const accessToken = req.user.access_token;

    const reposResponse = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const repos = await reposResponse.json();

    const languageCount = {};
    repos.forEach(repo => {
      if (repo.language) {
        languageCount[repo.language] = (languageCount[repo.language] || 0) + 1;
      }
    });

    const topLanguages = Object.entries(languageCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([language, count]) => ({ language, count }));

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
                    object(expression: "HEAD:README.md") {
                      ... on Blob {
                        text
                      }
                    }
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

    const pinnedRepos = graphqlData.data.viewer.pinnedItems.nodes.map(repo => {
      let readmeImage = null;
      let readmeLiveUrl = null;

      if (repo.object?.text) {
        // Match markdown images: ![alt](url)
        // OR HTML img tags: <img src="url" ...>
        const imageMatch = repo.object.text.match(
          /!\[.*?\]\((https?:\/\/[^\s)]+)\)|src="(https?:\/\/[^\s"]+)"/
        );
        const readmeImageUrl = imageMatch ? (imageMatch[1] || imageMatch[2]) : null;
        if (readmeImageUrl) {
          readmeImage = readmeImageUrl;
        }

        // Match ## Live Demo (or # Live Demo) followed by a URL on the next line(s)
        const liveDemoMatch = repo.object.text.match(
          /##?\s*live\s*demo\s*\n+(https?:\/\/[^\s\n]+)/i
        );
        if (liveDemoMatch) {
          readmeLiveUrl = liveDemoMatch[1].trim();
        }
      }

      return {
        name: repo.name,
        description: repo.description,
        url: repo.url,
        homepageUrl: repo.homepageUrl,
        stargazerCount: repo.stargazerCount,
        primaryLanguage: repo.primaryLanguage,
        readmeImage,
        readmeLiveUrl
      };
    });

    const allDays = contributions.contributionCalendar.weeks
      .flatMap(week => week.contributionDays);

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

    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    allDays.forEach(day => {
      const dayIndex = new Date(day.date).getDay();
      dayTotals[dayIndex] += day.contributionCount;
    });

    const mostActiveDay = dayNames[dayTotals.indexOf(Math.max(...dayTotals))];

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