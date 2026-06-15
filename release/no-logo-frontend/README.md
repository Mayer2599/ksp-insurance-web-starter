Release: No-logo frontend

- Purpose: a packaged frontend variant without logos for safe push.
- Location: `release/no-logo-frontend`
- Files:
  - `index.html` - minimal entry (same as original frontend)
  - `public/assets/` - assets folder (logo removed)
  - `data/data.json` - 10 masked records to keep backend flows intact

Usage:
- To use this variant for deployment or push, copy `public/assets` into `frontend/public/assets` and `data/data.json` where your backend expects it.
- This package purposely masks sensitive fields; replace with approved values only.
