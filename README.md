# DevRewind API

Node.js/Express backend for DevRewind, which turns GitHub activity into a shareable developer story card. It handles GitHub OAuth, fetches activity from GitHub's REST and GraphQL APIs, and stores the generated stats in Postgres.

**Live app:** https://devrewind.netlify.app · **Frontend repo:** [devrewind-client](https://github.com/Kenny-Harper/devrewind-client)

## What it does

- GitHub login with Passport.js (OAuth2)
- Fetches contributions, commits, languages and pinned repos, including README images and live demo URLs
- Calculates best streak and most active day
- Stores stats per user and serves them publicly by username

## Tech stack

- Node.js + Express 5
- PostgreSQL
- Passport.js + GitHub OAuth2
- GitHub REST API + GraphQL API
- Deployed on Railway

## API endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/auth/github` | GitHub OAuth login |
| GET | `/auth/github/callback` | OAuth callback, generates stats |
| GET | `/auth/me` | Returns the logged-in user |
| GET | `/auth/logout` | Log out |
| GET | `/api/stats/generate` | Fetches fresh stats |
| GET | `/api/stats/:username` | Public stats for any user |

## How projects are displayed

DevRewind displays your **pinned repositories** on GitHub (up to 6) as project cards. Pin your best work at github.com/your-username to control what appears on your DevRewind card.

## Setup

```bash
npm install
npm run dev
```

Create a `.env` file:

```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
BASE_URL=http://localhost:3000
DATABASE_URL=
SESSION_SECRET=
CLIENT_URL=http://localhost:5173
PORT=3000
NODE_ENV=development
```

Register a GitHub OAuth app with the callback URL `http://localhost:3000/auth/github/callback`.

## Related

- [devrewind-client](https://github.com/Kenny-Harper/devrewind-client): React/TypeScript frontend
