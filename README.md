# Ömer'in Defteri

A simple Turkish blog for Ömer's texts and stories, built with Eleventy (static
site generator) and Decap CMS (the writing form).

## Structure
- `src/posts/*.md` — each story is one file. Front matter: title, tarih, ozet (optional excerpt).
- `src/_includes/base.njk` — shared page shell (header, footer, fonts).
- `src/_includes/post.njk` — layout for a single story page.
- `src/index.njk` — homepage, lists all posts newest-first.
- `src/style.css` — all visual styling.
- `src/admin/` — the Decap CMS writing tool (Ömer's editing screen).
- `netlify.toml` — tells Netlify how to build the site.

## Local preview
```
npm install
npm start
```
Opens a local server, usually at http://localhost:8080

## Deploying (next steps, outside this sandbox)
1. Push this project to a new GitHub repository (free account).
2. Create a free Netlify account, "Import from Git", pick the repo.
   Netlify auto-detects netlify.toml — no manual config needed.
3. In Netlify: Site settings > Identity > Enable Identity, and enable
   Git Gateway (under Identity > Services). This is what lets the /admin
   writing form save posts without Ömer needing a GitHub account himself.
4. Invite Ömer as an Identity user (his email) so he can log into /admin.
5. Site will be live at a free `something.netlify.app` address. A custom
   domain can be added later under Domain settings.

## Comments (Cusdis)
1. Create a free account at https://cusdis.com
2. Create one "app" for this site (any name, e.g. "Ömer'in Defteri").
3. Copy the App ID it gives you.
4. Open `src/_data/site.js` and replace `YOUR_CUSDIS_APP_ID_HERE` with it.
5. New comments will show up in your Cusdis dashboard for moderation
   before appearing on the site (you can turn moderation off there too).

## Likes
No extra account needed — likes are stored using Netlify's built-in
Blobs storage, which is automatically available once the site is
deployed on Netlify. Each post gets its own counter, one like per
visitor (tracked in their browser, not perfectly bulletproof but fine
for a family site). Nothing to configure.
