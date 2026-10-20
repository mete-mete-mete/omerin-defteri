# Kiş İki Bayit Bir

A simple Turkish blog for Ömer's texts and stories, built with Eleventy (static
site generator). Stories are added through our own small writing page at `/admin/`
(no third-party login service).

## Structure
- `src/posts/*.md` — each story is one file. Front matter: title, tarih, date, ozet.
- `src/_includes/base.njk` — shared page shell (header, footer, fonts).
- `src/_includes/post.njk` — layout for a single story page (likes + comments).
- `src/index.njk` — homepage, lists all posts newest-first.
- `src/style.css` — all visual styling.
- `src/admin/index.html` — the writing page (password, new story / edit form, list of
  published stories with Düzenle and Sil buttons).
- `src/posts.json.11ty.js` — builds `/posts.json`, the public list of stories the
  admin page shows (title, date, address — nothing that isn't already on the homepage).
- `api/yayinla.mjs` — receives add / get / update / delete / photo-upload requests (a
  Vercel Function at `/api/yayinla`), checks the password, and changes the files in GitHub.
- `lib/yayinla-core.mjs` — the logic behind that function (password check, lockout after
  5 wrong tries, filename/date handling, plain text <-> HTML, photos).
- `api/begen.mjs` — the like counter (`/api/begen`).
- `lib/redis-depo.mjs` — tiny client for the Redis database that stores the like
  counts and the wrong-password counter.
- `vercel.json` — build settings and the long cache header for photos.

## How publishing works
Ömer opens `/admin/`, writes a title and text, types the password, presses Yayınla.
The function commits a new file to `src/posts/` in the GitHub repo. Vercel sees the
new commit, rebuilds the site, and the story is live about a minute later.

- Blank line = new paragraph. A single line break stays a line break (good for poems).
- The date is filled in automatically (Istanbul time). The short excerpt on the
  homepage is made from the first paragraph.
- Text is saved as plain text: characters like `-`, `*`, `#` have no special meaning.
- Five wrong passwords in a row lock the page for 15 minutes (this covers adding,
  editing and deleting alike).
- A draft of a new story is kept in the browser while typing, so closing the tab
  doesn't lose it. It is kept separately while a story is being edited.

## Editing and deleting
The "Yayındaki yazılar" list on `/admin/` shows every published story.
- **Düzenle** loads the story back into the form (password needed). Saving keeps the
  original publication date and the same web address; the title, text and homepage
  excerpt are updated.
- **Sil** asks for confirmation, then removes the story file. Likes and Cusdis comments
  for that address are not deleted, they just become unreachable.
- Each change is a normal commit in GitHub, so a deleted or overwritten story can always
  be recovered from the repository history (the file's "History" button).
- The list comes from the last published version of the site, so a story added or deleted
  a moment ago shows up or disappears in the list after the site finishes rebuilding
  (the page also updates the list itself right away).
- If a story was changed somewhere else (for example directly in GitHub) while it was
  open for editing, saving or deleting is refused with a message instead of overwriting.
- Stories written by hand (like the three placeholder stories) can be edited too; when
  saved they are converted to the same plain-text format. Markdown symbols in them then
  show up as ordinary characters.

## Photos

In the writing page, "＋ Fotoğraf ekle" inserts a photo at the cursor in the text (the text is split there), so photos can go between paragraphs. Each photo card has a caption field, ↑/↓ buttons (move by one paragraph) and "Kaldır".

- Photos are resized in the browser (max 1600px, JPEG), typically 300–600 KB. Limit: 30 photos per story.
- Stored in `src/images/yazi/<hash>.jpg`; the story and its photos are saved in a single commit, so only one deploy runs (Vercel's free plan allows 100 deploys a day).
- Photos removed from a story, or left over from a deleted story, stay in the repo (harmless; delete them on GitHub if you want to free space).
- Drafts saved in the browser keep the text only, not photos.

## Setup on Vercel (once)
1. Sign in at https://vercel.com with the GitHub account that owns the repository.
2. **Add New > Project**, pick the `omerin-defteri` repository, leave the settings as they
   are (they come from `vercel.json`) and press **Deploy**.
3. Open **Integrations > Browse Marketplace** and add a **Redis** database (the free plan is
   enough; either "Redis" or "Upstash" works), then **connect it to this project**
   (Projects tab > Connect Project). Vercel adds the connection variable(s) to the project by
   itself: `REDIS_URL` for Redis Cloud, or `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) for Upstash. A custom prefix
   in front of the name is fine.
4. Project > **Settings > Environment Variables**: add the variables below.
5. **Deployments** > the three dots on the latest deployment > **Redeploy** so the functions
   can see the new variables.

| Name | Value |
|------|-------|
| `ADMIN_PASSWORD` | The password Ömer types on /admin. Pick something long, e.g. four random words. |
| `GITHUB_TOKEN` | A GitHub token that can write to this one repository (see below). |
| `GITHUB_REPO` | `your-github-username/omerin-defteri` |
| `GITHUB_BRANCH` | Optional. Only if your branch isn't called `main`. |

### Custom domain
Project > **Settings > Domains** > add the domain. Vercel shows the exact DNS records
(an A record for the bare domain and a CNAME for `www`, or nameservers if you prefer to
let Vercel manage DNS). HTTPS is automatic. Then change the site address in Cusdis.

### Creating the GitHub token
GitHub > your profile picture > Settings > Developer settings > Personal access
tokens > **Fine-grained tokens** > Generate new token.
- Repository access: **Only select repositories** > choose `omerin-defteri`.
- Permissions > Repository permissions > **Contents: Read and write**. Nothing else.
- Expiration: choose the longest offered. When it expires, saving stories will fail
  with "Yazı kaydedilemedi" until you make a new token and replace `GITHUB_TOKEN`
  in Vercel (then redeploy).

(GitHub occasionally renames menus; the idea is: a token limited to this repo, with
Contents read/write.)

## Local preview
```
npm install
npm start
```
Opens a local server, usually at http://localhost:8080. The like counter and the
writing page only work once deployed on Vercel.

## Comments (Cusdis)
1. Create a free account at https://cusdis.com
2. Create one "app" for this site (any name, e.g. "Kiş İki Bayit Bir").
3. Copy the App ID it gives you.
4. Open `src/_data/site.js` and replace `YOUR_CUSDIS_APP_ID_HERE` with it.
5. New comments will show up in your Cusdis dashboard for moderation
   before appearing on the site (you can turn moderation off there too).

## Likes
Likes are stored in the Redis database from step 3 above. Each post gets its own counter
(increased atomically, so two likes at the same moment both count), one like per visitor
(tracked in their browser, not perfectly bulletproof but fine for a family site).

## Limits to know about
- Vercel's free (Hobby) plan is for personal, non-commercial use: fine for a family
  journal, not for ads or selling things.
- A request to a function can be at most 4.5 MB. Photos are shrunk in the browser first
  (usually 300–600 KB), so this is never reached in normal use.
