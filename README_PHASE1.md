Phase 1: Run a local API for the Time Tracker

This scaffolds a minimal Node.js + Express API to host users and session data.

Quick start (from the `server` folder):

1. Install dependencies

```bash
cd server
npm install
```

2. Start the API

```bash
npm start
```

By default the API runs on `http://localhost:4000`.

Available endpoints:
- `POST /auth/signup` { email, password, name } -> { token, user }
- `POST /auth/login` { email, password } -> { token, user }
- `GET /sessions` (auth) -> list sessions
- `POST /sessions` (auth) { label, time, duration } -> created session
- `PUT /sessions/:id` (auth) -> update
- `DELETE /sessions/:id` (auth) -> delete
- `GET /sessions/totals` (auth) -> total seconds and formatted total
- `GET /sessions/export` (auth) -> CSV download

Notes:
- Auth uses JWT with `JWT_SECRET` env var (default is a dev secret in `index.js`).
- DB is a local SQLite file `server/data.db` created automatically.

Next steps I can do:
- Integrate the frontend to call this API (with login UI and token storage).
- Deploy API to a small host (Fly.io / Railway) and connect a managed DB.
- Add email verification and password reset.
