# Time Tracker Local Server

This server hosts both the API and the frontend files for local development.

## Setup

1. Install dependencies:

```powershell
cd server
npm install
```

2. Start the server:

```powershell
$env:JWT_SECRET='change_this'
npm start
```

3. Open the app in your browser:

- `http://localhost:4000/`
- `http://localhost:4000/reset.html?token=...`

## Notes

- The server now serves `index.html` and `reset.html` from the project root.
- Auth uses JWTs stored in `localStorage` for local testing.
- If you want real reset emails, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`.

## Environment variables

- `JWT_SECRET` — required for auth tokens
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` — optional for email delivery
- `FRONTEND_RESET_URL` — optional override for password reset link generation
