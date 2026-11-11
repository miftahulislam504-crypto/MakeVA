# Remotion Cloud

Upload a Remotion project zip and get an MP4. Rendering runs on the user's own
GitHub Actions. This site only coordinates the work.

## How it works

1. The user enters a GitHub username and a classic personal access token
   (scopes: `repo`, `workflow`). The token stays in the browser.
2. The site creates one repository (`remotion-renderer`) in the user's account
   and installs `.github/workflows/render.yml` plus `.remotion-cloud/detect.mjs`.
3. Each render uploads the zip to `jobs/<id>/input.zip` and dispatches the
   workflow. The workflow unpacks the zip, installs dependencies, detects the
   entry file and composition, renders, and publishes the MP4 as a GitHub
   Release named `render-<id>`.
4. The site polls the run, shows progress, and lists finished videos from the
   repository's releases.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Push to GitHub and import the repository in Vercel. No environment variables
are needed.

## Notes

- The token is sent to the server only by `/api/download`, once per download,
  to obtain a short-lived signed URL from GitHub. It is not logged or stored.
- Zip limit in the browser is 50 MB. `node_modules` must not be inside the zip.
- Remotion is free for individuals and small teams. Larger companies need a
  Remotion license.
