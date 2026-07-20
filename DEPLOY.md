# Deploy

The landing page is static — no build step. Deploying means copying
`index.html`, `css/`, and `js/` to the Hostinger VPS.

**Host:** `root@179.197.79.11` (SSH alias `hostinger`, key `~/.ssh/hostinger_vps`)
**Live at:** https://qomers.com (and www.qomers.com)
**Webroot:** `/var/www/qomers-landing/current` — `index.html` sits directly here, not in a subfolder.

`app.qomers.com` runs on the same box from `/var/www/qomers-app/current/public`
under a separate nginx server block. It shares nothing with the landing page.

## Sync first

Deploys copy the *working tree*, not `origin/main`. A clean `git status` only means
you have no uncommitted edits — it does not mean you are up to date. Always:

```sh
git fetch origin && git status -sb   # confirm "## main...origin/main" with no [behind N]
git pull --ff-only origin main
```

This has already bitten once: a deploy shipped a version two commits stale, and the
live site was missing the entire pricing section.

## Upload

From the repo root:

```sh
rsync -avz --delete \
  --exclude='.git' --exclude='.claude' --exclude='.DS_Store' \
  --exclude='Qomers Logo' --exclude='.nojekyll' --exclude='DEPLOY.md' \
  ./ hostinger:/var/www/qomers-landing/current/
```

Add `-n` for a dry run first.

The excludes are not optional. `--delete` with a bare `./` would otherwise publish
`.git/` into the webroot, making the full source history clonable from
https://qomers.com/.git/ — nginx's `try_files` would happily serve it.

`Qomers Logo/` is design source only; nothing on the page references it. Every
image in `index.html` is an inlined base64 data URI, so the deploy is just three files.

## Permissions

```sh
ssh hostinger '
  chown -R www-data:www-data /var/www/qomers-landing
  find /var/www/qomers-landing -type d -exec chmod 755 {} \;
  find /var/www/qomers-landing -type f -exec chmod 644 {} \;
'
```

Reloading nginx is *not* needed — it reads static files from disk per request.
Only reload after editing config, and validate first: `nginx -t && systemctl reload nginx`.

## Verify

```sh
curl -sI https://qomers.com | head -3
curl -sI https://app.qomers.com | head -1   # should still be 200
```

Note that a 404-looking path returns 200 with the `index.html` body — that is the
`try_files $uri $uri/ /index.html` fallback, not a real file. Check response size
or content to tell a real file from the fallback.

TLS is Let's Encrypt via certbot, renewing automatically.
