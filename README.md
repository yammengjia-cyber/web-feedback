# Sunburella Feedback Sky

A simple full-stack website where users submit text feedback and each message becomes a floating cloud in a calm morning sky.

## Features

- Public feedback input (no login)
- Cloud-style UI with drifting animation
- New submitted feedback rises gently
- Backend stores data in GitHub repo JSON file
- Shows latest 20 items only

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local`:

- `GITHUB_TOKEN`: GitHub personal access token (repo write permission)
- `GITHUB_REPO_OWNER`: repo owner
- `GITHUB_REPO_NAME`: repo name
- `GITHUB_REPO_BRANCH`: branch, usually `main`
- `FEEDBACK_FILE_PATH`: JSON file path in repo, e.g. `web-feedback-data/feedback.json`

4. Run dev server:

```bash
npm run dev
```

## Deployment (recommended: Vercel)

1. Push this `web-feedback` folder to your GitHub repository.
2. Import project in [Vercel](https://vercel.com/).
3. Add the same env vars in Vercel Project Settings.
4. Deploy.

After deployment, users can open the real public URL from Vercel.
