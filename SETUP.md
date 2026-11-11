# Set up Supabase and GitHub Pages

The files are prepared; your accounts have not been connected or changed. You will fill in two public settings and complete the dashboard steps below.

## 1. Create the database tables

Use your new Supabase project.

1. Open **SQL Editor** in the left sidebar and create a new query.
2. Open `supabase/setup.sql` from this package in a text editor. Copy its entire contents into the query.
3. Choose **Run** and check that it completes successfully.
4. In **Table Editor**, check that `town_suggestions`, `town_settings` and `town_staff` exist. The suggestions table should be empty; bingo starts with the default topics.

The setup creates the tables and access rules in one transaction. It does not insert sample submissions or a default admin account. Do not paste your Supabase database password into the SQL file.

### If you already ran an earlier town setup

If your project already contains `town_suggestions`, do not run the fresh-project setup over it. Your earlier setup files have a different table history. Apply only the missing upgrades from `supabase/upgrades/`, in order:

- Original setup → v2 → v3 → v4 → v5.
- If you already ran the previous complete v5 setup, no database upgrade is needed for this package.
- An existing v4 installation needs only `supabase-upgrade-v5-illustrated-pages.sql`.

Those upgrades preserve existing submissions. If you are unsure which version was run, check the saved SQL query or ask before changing an existing database.

## 2. Deploy Spotify song lookup

This makes automatic song title and artist lookup work on GitHub Pages. It uses public Spotify metadata and needs no Spotify developer account or secret.

### Through the Supabase dashboard

1. Open **Edge Functions** and choose **Deploy a new function → Via Editor** (the dashboard wording may vary).
2. Name it exactly **`spotify-track`**.
3. Replace the default `index.ts` contents with the entire contents of `supabase/functions/spotify-track/index.ts` from this package.
4. Deploy it. In that function's details/settings, turn off **Verify JWT** / **Enforce JWT Verification** for this function. It is intentionally public so signed-out viewers can look up public songs. This does not change database access rules.
5. Open the following address in a browser, replacing `YOUR_PROJECT_REF` with your project reference:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/spotify-track?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F11dFghVXANMlKmJXsNCbNl
```

A successful response contains `id`, `url`, `title` and `artist`. A `401` usually means JWT verification is still enabled. If Spotify is temporarily unavailable, you may receive a readable error instead; the song form will offer manual title/artist entry.

The function accepts only Spotify track links, fetches fixed Spotify hosts, limits upstream response size, caches public results in memory and returns only public metadata. It does not use a database secret or return Spotify session data. Spotify's public embed document supplies the artist names; a change to its format may require updating the function.

Dashboard help: [Supabase Edge Functions editor](https://supabase.com/docs/guides/functions/quickstart-dashboard), [public function authentication](https://supabase.com/docs/guides/functions/auth).

### Optional: Supabase CLI

From the repository root, with the Supabase CLI installed:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy spotify-track --no-verify-jwt
```

`supabase/config.toml` retains the public-function setting for subsequent deploys. These commands deploy only the function; the database SQL is still run separately in step 1. See [Supabase deployment instructions](https://supabase.com/docs/guides/functions/deploy).

## 3. Fill in the website's public settings

In the Supabase project's **Connect** dialog or **Settings → API Keys**, copy the project URL and **publishable key**. A legacy `anon` key is also supported.

Edit `docs/config.js`:

```js
supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
supabasePublishableKey: "YOUR_PUBLIC_PUBLISHABLE_KEY",
```

Keep `previewMode: false`. Leave `spotifyMetadataUrl` empty; the website will automatically use the `spotify-track` function in the same Supabase project. `discordInviteUrl` is optional.

These public values are designed to appear in browser code. Never use `service_role`, an `sb_secret_...` key, the database password or a Spotify client secret here. See [Supabase API keys](https://supabase.com/docs/guides/api/api-keys).

## 4. Upload to GitHub and enable the website

1. Create a GitHub repository, for example `xalxhh-town`. A public repository can use GitHub Pages on GitHub Free.
2. Unzip the supplied package on your computer.
3. In the repository, choose **Add file → Upload files**. Upload the package's **contents**, including the `docs` and `supabase` folders and README. Do not upload the ZIP itself or put everything inside another enclosing folder. At the repository root you should see `docs`, `supabase`, `README.md` and `SETUP.md`.
4. Commit the upload to **main**.
5. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**. Choose **main**, then **/docs**, and save.
6. Wait for GitHub to show the published address, usually `https://YOUR_GITHUB_NAME.github.io/xalxhh-town/`.

The site has relative asset paths so it works inside a repository URL. The empty `docs/.nojekyll` file is included; keep it when uploading. If your file picker hides dotfiles, reveal them or use GitHub's Create new file option to add `docs/.nojekyll` and the root `.gitignore` from the package.

Only `docs/` is published as web content. The Supabase files remain setup/source files in the repository. Nothing in the package needs a website build command. See [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## 5. Enable streamer and moderator sign-in

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to the exact published website address, including the repository path and ending slash, for example `https://YOUR_GITHUB_NAME.github.io/xalxhh-town/`.
3. Add this exact address to **Redirect URLs**, preserving the repository path:

```text
https://YOUR_GITHUB_NAME.github.io/xalxhh-town/?page=admin
```

4. Keep the **Email** authentication provider enabled. For the initial email sign-in to create an account, leave **Allow new users to sign up** enabled until staff have signed in. A viewer signing in does not automatically receive a staff role.
5. Configure custom SMTP/email delivery for real staff addresses before relying on sign-in emails in production. Supabase's built-in mail service has delivery restrictions and rate limits; see [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).
6. On the published website choose **Admin**, enter the streamer's email and choose **Send sign-in link**. Open that email link in the same browser. Until the staff role is assigned, the site will correctly say the account has no moderator access.
7. Open `supabase/add-staff.sql`, replace the example email and select `admin` or `moderator`. Paste it into a new SQL Editor query and run it. The account must have signed in at least once.
8. Refresh the website. The staff controls should appear. Repeat for each moderator.

The streamer and moderators use their own email sign-in links. The local mockup password cannot grant access to shared data. Only the project owner can assign roles through the Supabase dashboard/SQL Editor. See [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

To revoke staff access, remove that person's row from `town_staff` in Supabase and have them sign out. The server checks permissions for each delete or bingo edit.

## 6. Check the finished setup

- Open the published site in two browsers. Submit a game, video, song and wheel idea in one. Both should show the same suggestions, usually immediately or within five seconds.
- Paste a valid Spotify **song** link. Its title and artist should load automatically and the player should appear. If lookup fails, verify the Edge Function and use the manual fields in the meantime.
- Sign in as staff, delete an entry from each suggestion category, and confirm it disappears in the other browser.
- Change a bingo topic as staff and check that the viewer card updates and resets its marks.
- In a signed-out browser, open Admin and confirm moderation controls remain unavailable.

No submissions are stored in browser storage. Supabase Auth may store the staff sign-in session in the browser so staff stay signed in; sign out on shared computers.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Pages gives a 404 | The repository has `docs/index.html`, and Pages uses main → /docs. |
| Artwork is missing | All of `docs/assets/` was uploaded with the same file names and letter case. |
| Submissions unavailable | Both public settings are filled in, the SQL completed, and the Supabase project is running. |
| Song title does not load | The function is named `spotify-track`, has been deployed, and JWT verification is off for that public function. |
| No sign-in email | Email provider and SMTP delivery are configured; check spam and Supabase email rate limits. |
| Sign-in returns to the wrong site | Site URL and the exact `?page=admin` redirect include the GitHub repository path. |
| Signed in without moderator access | Run the edited add-staff template for that exact existing email, then refresh. |
| Private example data appears online | Restore `previewMode: false` in `docs/config.js` and redeploy. |

The source checks and local database tests do not connect your actual project. The final account/email/realtime checks require your own settings and a deployed function.
