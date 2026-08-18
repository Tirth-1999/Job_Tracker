# Job Tracker

A lightweight static Kanban board for tracking job applications. Gmail sync runs from GitHub Actions every 30 minutes and commits updates to `data/applications.json`.

## Views

- Board: six-lane Kanban view.
- Companies: company list to quickly check where you have applied.
- Applications: searchable application table.

## Status Lanes

- Applied
- Initial Revert Needed
- Reply Needed
- Interviewed
- Offered
- Rejected

## Local Preview

Run a static server from this folder:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Gmail Sync Setup

Create a Google OAuth web client with Gmail API enabled.

Add this authorized redirect URI to the OAuth client:

```text
http://localhost:53682/oauth2callback
```

Then generate a refresh token locally:

```sh
GMAIL_CLIENT_ID="your-client-id" GMAIL_CLIENT_SECRET="your-client-secret" node scripts/get-gmail-refresh-token.mjs
```

Store these repository secrets in GitHub:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

The workflow runs every 30 minutes and can also be started manually from the GitHub Actions tab.

Optional repository variable:

- `GMAIL_QUERY`: defaults to `newer_than:14d (application OR interview OR recruiter OR hiring OR offer)`

## Data

Applications live in `data/applications.json`. The GitHub Action commits changes only when the sync script finds matching Gmail messages.
