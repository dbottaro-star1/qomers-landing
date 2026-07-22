# Deploy

The landing page is static — no build step. Deploying means copying
`index.html`, `css/`, and `js/` to the Hostinger VPS.

**Host:** `root@179.197.79.11` (SSH alias `hostinger`, key `~/.ssh/hostinger_vps`)
**Live at:** https://qomers.com (and www.qomers.com)
**Webroot:** `/var/www/qomers-landing/current` — `index.html` sits directly here, not in a subfolder.

`app.qomers.com` runs on the same box from `/var/www/qomers-app/current/public`
under a separate nginx server block. It shares nothing with the landing page.

## Deploy

```sh
./deploy.sh              # dry run against origin/main — shows what would change
./deploy.sh --apply      # deploy
./deploy.sh --apply v2   # deploy some other ref (tag, branch, commit)
```

The script fetches, extracts `git archive origin/main` to a temp dir, rsyncs that
with `--delete`, fixes ownership to `www-data`, and verifies over HTTPS that the
bytes being served match what was shipped. It exits non-zero if they do not.

Reloading nginx is *not* needed — it reads static files from disk per request.
Only reload after editing config, and validate first: `nginx -t && systemctl reload nginx`.

## Why it deploys a ref, not the working tree

Deploys publish a *committed ref*, so uncommitted edits and a stale local checkout
cannot reach production. This matters: a deploy once shipped a version two commits
stale and the live site was missing the entire pricing section. Under the old
working-tree rsync, a clean `git status` did not mean you were up to date.

The consequence is that **committing and pushing is now part of deploying**. If a
change is not in `origin/main`, it does not ship — the script prints a note when
your working tree differs from the ref being deployed.

Two risks are now structural rather than a flag someone has to remember:

- `git archive` never emits `.git/`. The old command relied on `--exclude='.git'`;
  forgetting it would publish the full source history at https://qomers.com/.git/,
  since nginx's `try_files` would happily serve it.
- Files tracked but not published (`DEPLOY.md`, `deploy.sh`, `.nojekyll`, dotfiles)
  are marked `export-ignore` in `.gitattributes` instead of listed as rsync
  excludes. Add new ones there.

`Qomers Logo/` is design source and untracked, so it cannot ship.

## Images: inline or self-host, never hotlink

Every image the site renders must be either an inlined base64 data URI or a file
committed to the repo — **never an external hotlink** (e.g. `images.unsplash.com`).
`index.html` uses data URIs throughout; the blog may also reference committed files
under `blog/`.

External hotlinks look fine in dev but render as grey broken-image boxes for any
visitor whose ad/privacy blocker or network drops the request, and they rot when the
host removes the asset. This already bit once: four Unsplash hotlinks in the hero
case study and testimonials showed as broken greys until they were inlined
(commit `b54ffca`). When adding blog images via `build_blog.py`, embed them as data
URIs or commit them under `blog/` — do not paste a remote URL.

## Verify

```sh
curl -sI https://qomers.com | head -3
curl -sI https://app.qomers.com | head -1   # should still be 200
```

Note that a 404-looking path returns 200 with the `index.html` body — that is the
`try_files $uri $uri/ /index.html` fallback, not a real file. Check response size
or content to tell a real file from the fallback.

TLS is Let's Encrypt via certbot, renewing automatically.

## Nginx config

`infra/nginx-qomers.com.conf` is the versioned reference of the production nginx
server block for `qomers.com` / `www.qomers.com`. The live config lives at
`/etc/nginx/sites-available/qomers.com` on the VPS (symlinked from
`sites-enabled/`); this file is a copy so the config does not depend solely on the
box or its backups.

It includes the `location = /site.webmanifest` block with a scoped `types` map that
serves the manifest as `application/manifest+json` instead of the default
`application/octet-stream`. The `types` block is scoped to that one location on
purpose — a bare `types` block at server level would replace the inherited
`mime.types` and break every other file's Content-Type.

`infra/` is marked `export-ignore`, so `git archive` never ships it to the webroot.
It is a reference only — editing it does not change production.

To re-apply on a fresh server (adjust cert paths if certbot has not run yet):

```sh
sudo cp infra/nginx-qomers.com.conf /etc/nginx/sites-available/qomers.com
sudo ln -sf /etc/nginx/sites-available/qomers.com /etc/nginx/sites-enabled/qomers.com
sudo nginx -t && sudo systemctl reload nginx
```

Keep this file in sync by hand after any change to the live nginx config —
nothing automates the copy.
