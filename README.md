# Soccer Game Snacks Fall 2026

A static, phone-friendly snack signup site for eight fall soccer games. One family brings both snacks and drinks. Parents enter a name and optional note, with no account. Claimed slots cannot be edited, canceled, or overwritten through the site.

## Preview

Open `index.html` in a browser. No build or server is required. With an empty `apiUrl`, the page displays a **Preview only** notice. Sample signups are stored in this tab's session storage; they do not reach a spreadsheet or other parents. Preview data is never imported into the live schedule.

## 1. Connect a private Google Sheet

1. Create a new Google Sheet in your personal Google account. Keep its sharing setting **Restricted**.
2. In that sheet, choose **Extensions > Apps Script**.
3. Replace the editor's `Code.gs` with the contents of `google-apps-script/Code.gs` in this project.
4. Save, select `setup` in the function dropdown, and click **Run**. Authorize the script to access your spreadsheet. This creates a `Games` tab containing the eight dates and times. Running setup again preserves existing data.
5. Select **Deploy > New deployment > Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Deploy and copy the URL ending in `/exec`. A school/work account may restrict anonymous web apps; use a personal account if the Anyone option is missing.
6. Put that URL in `config.js` as `apiUrl`. No API key, spreadsheet ID, or Google credentials belong in the site's files.
7. Open the `/exec` URL in a signed-out/private browser. It should return JSON with `"ok":true` and eight games, without asking for a login.

The public script exposes only game dates/times, family names, and notes. Game locations are omitted from all API responses, including signup confirmations and conflicts. The spreadsheet itself stays private. Use one script project/deployment for this sheet so all signups share the same lock.

## 2. Publish on GitHub Pages

1. Create a GitHub repository and upload this project, including `assets`, `config.js`, `app.js`, `styles.css`, `index.html`, and `.nojekyll`. Do not upload `node_modules` or test reports. A public repository supports GitHub Pages on GitHub Free.
2. In the repository, open **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, and save.
4. Wait for the Pages deployment, then open the link GitHub provides. Relative asset paths support a project URL such as `https://YOUR-USERNAME.github.io/team-snacks/`.

No build pipeline, paid database, or Node server is needed in production.

## 3. Verify before sharing with parents

The Google-hosted deployment cannot be verified until you connect your account. From the published site:

1. Confirm the preview notice is gone and all eight games load with dates and times only. Check that the public API response contains no location fields.
2. Open the same available game in two separate browsers. Reserve it in one, then submit the stale form in the other. The second should report that another family reserved it; the first name must remain in the sheet.
3. Refresh both browsers and confirm they show the same reserved family and note.
4. In the spreadsheet, clear the test game's `name`, `note`, `requestId`, and `claimedAt` cells (columns F through I). Refresh the site to confirm it is available again.

## Manage the season

- Change the title and optional `teamNote` (snack quantity, allergy guidance, etc.) in `config.js`.
- Add or change games in the private `Games` sheet. Keep the header names/order. Each game needs a unique, stable `id`, `date` as `YYYY-MM-DD`, and times as `HH:mm` in 24-hour Eastern time. Keep these cells formatted as **Plain text**. The legacy `location` column (E) can stay blank; it is retained for compatibility and is never returned by the API.
- To cancel a signup, clear **all four cells F:I** for that game. Clearing only the name does not remove the backend lock. Avoid editing a signup while a parent is submitting it: script locks coordinate web requests, not manual spreadsheet edits.
- To correct a parent's name or note without canceling, edit columns F/G directly.
- To change backend code, save it, then use **Deploy > Manage deployments > Edit > New version > Deploy**. Updating the existing deployment preserves its URL.
- If upgrading an existing deployment, publish the updated `Code.gs` as a new version as well as updating the site's files. Older backend versions still return locations.
- Prior dates remain visible but cannot receive new signups. Same-day signups remain open.

No email reminders or parent cancellation links are included. Anyone with the public endpoint can read names/notes and claim an empty slot, but there is no public update/delete operation. The `noindex` tag discourages indexing; it is not access control.

## Implementation and checks

The browser uses GET to read the schedule and a simple `text/plain` POST containing JSON to claim a slot. Apps Script returns JSON through Content Service, which redirects to a Google response URL. The browser follows that redirect and requires a readable confirmed response before showing success; it never treats an opaque `no-cors` response as a saved signup.

Inside the backend, a script lock encloses the read/check/write, and spreadsheet writes are flushed before releasing it. A random per-submission request ID makes retries idempotent after a lost response. Request IDs are not returned in the public schedule. User text is rendered as text and spreadsheet formula prefixes are escaped.

```sh
npm install
npm test
npm run test:browser
```

Browser tests require Playwright Chromium (`npx playwright install chromium`). They start a temporary local server, check desktop/mobile layouts and the signup flow, and mock the Google transport. Backend tests execute the actual Apps Script code with in-memory Google service doubles. Neither substitutes for the live Google deployment checks above.

If Chromium reports missing Linux libraries, install its dependencies with `npx playwright install-deps chromium`.

## References and assets

- [Google Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [Google Content Service and redirects](https://developers.google.com/apps-script/guides/content)
- [Google script locks and flushing spreadsheet writes](https://developers.google.com/apps-script/reference/lock/lock)
- [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- Icons: [Lucide](https://lucide.dev), ISC license in `assets/icons/LICENSE`.
- Soccer photo: [Unsplash image](https://images.unsplash.com/photo-1574629810360-7efbbe195018), downloaded locally so viewing the site does not contact an image service.
