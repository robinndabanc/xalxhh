# Package checks

Prepared on 11 November 2026. This package has not been uploaded, published or connected to a live Supabase project.

The 14 included Node checks passed. They cover local file references, GitHub repository paths, browser script syntax, production configuration, no fallback to private examples, choosing the Supabase Spotify endpoint, metadata retries/caching, function CORS, invalid URLs, multiple artists and filtering metadata responses.

The actual Edge Function handler was also called with a public Spotify track and returned the correct song title/artist and CORS headers.

The new SQL was run in a temporary PostgreSQL instance with stand-ins for Supabase Auth roles and users. The checks covered guest posts, signed-in posts, staff deletion and bingo edits, denied viewer moderation, denied role/author spoofing, invalid submissions, bingo revisions, the staff-assignment template, realtime publication membership and preserving data on a setup rerun. Legacy/partial schemas are refused before any privileges change.

The local admin login was checked in a browser with the two requested text lines removed. The earlier song-submission fix remains included: unavailable Spotify lookup reveals manual title/artist fields instead of blocking the suggestion.

Actual email delivery, live multi-browser database updates, GitHub Pages hosting and a deployed Supabase Edge Function still require the account settings in SETUP.md. The local database test verifies SQL access rules; it does not verify the hosted Auth or realtime transport services.
