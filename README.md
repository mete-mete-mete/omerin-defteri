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
