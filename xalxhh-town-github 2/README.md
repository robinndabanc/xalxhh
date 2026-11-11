# xalxhh's little town

A community island with illustrated game, YouTube and song suggestion boards, spin the wheel, viewer bingo and an admin area.

This folder is ready to upload to a GitHub repository. It contains the active website, your artwork and the Supabase setup files. No website build step is needed.

## Start here

Follow **[SETUP.md](SETUP.md)** in order:

1. Run `supabase/setup.sql` in your new Supabase project's SQL Editor.
2. Deploy the included `spotify-track` Edge Function for automatic song titles and artists.
3. Add your Supabase project URL and public publishable key to `docs/config.js`.
4. Upload this folder's contents to GitHub, then enable Pages from `main` → `/docs`.
5. Set the allowed sign-in redirect address in Supabase, sign in and assign staff roles.

If your database already contains the earlier town tables, use the existing-project instructions in SETUP.md before running any SQL.

## What's included

| Path | Purpose |
| --- | --- |
| `docs/` | The complete website and its illustration assets; GitHub Pages publishes this folder. |
| `docs/config.js` | The public settings you fill in before publishing. |
| `supabase/setup.sql` | Fresh-project database, shared submissions, access rules, bingo and live updates. |
| `supabase/add-staff.sql` | Template for granting a signed-in streamer or moderator access. |
| `supabase/functions/spotify-track/index.ts` | Public Spotify title/artist lookup for the song form. |
| `supabase/config.toml` | CLI configuration for the public metadata function. |
| `supabase/upgrades/` | Missing upgrades for older town database installations. |
| `tests/` | Local package and function checks; they do not contact your Supabase account. |

## How it works

Games and songs use a 3×3 note grid. Videos use six clouds per page. New suggestions appear immediately in the shared database. Wheel ideas are added without approval. Admins and moderators can delete suggestions and change the 24 bingo topics; the middle square remains free.

The Spotify form loads the real title and artist using the included Edge Function and displays an embedded player. If lookup is unavailable, viewers can enter the title and artist manually and still submit. The player itself follows Spotify's sign-in, preview and playback availability; it does not add tracks to the streamer's Spotify queue.

The video board keeps the current mockup behavior: supplied example YouTube links have titles, while other YouTube links use a clearly labelled title placeholder. A live YouTube title lookup has not been added by this packaging update.

The published package has preview mode turned off. It starts with empty suggestion boards; it never uploads the mockup's example suggestions. Failed shared saves do not create browser-only copies. Each viewer's bingo marks are private to that open page.

## Admin access

The published website uses Supabase email sign-in links and server-enforced staff roles. The local mockup password does not unlock the shared database. Staff setup is explained in SETUP.md; no shared password, database password or secret key needs to be uploaded to GitHub.

The cleaned admin page has no preview-mode banner or password-explanation paragraph.

## Checks

Node.js 24 or newer is needed only to run the optional source checks:

```sh
npm test
```

Uploading and publishing the website requires no Node.js installation. Deploying the Edge Function through the Supabase dashboard also requires no local tooling.

## Editing later

Edit the files in `docs/` and commit the changes to GitHub to update the website. Deploy function changes separately in Supabase. Keep any assigned staff roles and real submissions in Supabase; they are not stored in the repository.

The original Photoshop files and the earlier standalone prototypes are not required for publishing and are not included in this package.
