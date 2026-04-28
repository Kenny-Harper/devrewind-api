# DevRewind API

Node.js/Express backend for DevRewind — turns GitHub activity into a shareable developer story card.

## Tech Stack
- Node.js + Express 5
- PostgreSQL
- Passport.js + GitHub OAuth2
- GitHub REST API + GraphQL API

## API Endpoints
- GET /auth/github — GitHub OAuth login
- GET /auth/me — returns logged in user
- GET /api/stats/generate — fetches fresh stats
- GET /api/stats/:username — public stats for any user

## Setup
- npm install
- Add .env with GitHub OAuth credentials
- npm run dev

## Related
- [devrewind-client](https://github.com/Kenny-Harper/devrewind-client)
