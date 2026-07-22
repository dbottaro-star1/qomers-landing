#!/usr/bin/env python3
"""
Generador estático del blog de Qomers.

Lee blog/articles.json y produce:
  - blog/index.html            (listado de todos los artículos)
  - blog/<slug>/index.html     (cada artículo, con SEO completo)
  - sitemap.xml                (en la raíz del sitio)
  - robots.txt                 (en la raíz del sitio)

Uso:
  python3 blog/build_blog.py

Diseño: reusa el CSS del sitio (css/styles.css) + blog/blog.css, y replica
nav/footer para consistencia visual. Todo el SEO (meta, Open Graph, Twitter,
JSON-LD Article + BreadcrumbList) se genera por artículo.

Imágenes: NUNCA hotlinkees a un host externo (images.unsplash.com y similares).
Un hotlink se ve bien en dev pero aparece como caja gris rota para cualquier
visitante cuyo bloqueador o red corte el request, y se pudre si el host borra el
asset. Embebé cada imagen como data URI base64, o commiteála bajo blog/. Ver
DEPLOY.md ("Images: inline or self-host, never hotlink").
"""
import json, os, html, re, sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOG = os.path.join(ROOT, "blog")

def esc(s): return html.escape(s, quote=True)

def load():
    with open(os.path.join(BLOG, "articles.json"), encoding="utf-8") as f:
        return json.load(f)

# --- Logo (reused from the main site, base64) -------------------------------
def read_logo():
    """Pull the nav logo data-URI from index.html so the blog matches exactly."""
    idx = os.path.join(ROOT, "index.html")
    with open(idx, encoding="utf-8") as f:
        h = f.read()
    m = re.search(r'<a class="logo"[^>]*>\s*<img class="logo-img" src="([^"]+)"', h)
    return m.group(1) if m else ""

LOGO = read_logo()

# --- Shared chrome ----------------------------------------------------------
def nav(depth):
    home = "../" * depth
    return f'''<nav id="nav">
  <div class="nav-in">
    <a class="logo" href="{home}index.html"><img class="logo-img" src="{LOGO}" alt="Qomers"/></a>
    <div class="nav-c">
      <a href="{home}index.html#valor">Producto</a>
      <a href="{home}index.html#integraciones">Integraciones</a>
      <a href="{home}index.html#seguridad">Seguridad</a>
      <a href="{home}index.html#precios">Precios</a>
      <a href="{home}blog/index.html" class="nav-here">Blog</a>
    </div>
    <div class="nav-r">
      <a class="btn btn-lime nav-cta" href="{{wa}}" target="_blank" rel="noopener noreferrer">Conectar mi tienda <span class="chev">›</span></a>
    </div>
  </div>
</nav>'''

def footer(depth, wa):
    home = "../" * depth
    year = datetime.now().year
    return f'''<footer>
  <div class="foot-in">
    <div class="foot-simple">
      <a class="logo" href="{home}index.html"><img class="logo-img" src="{LOGO}" alt="Qomers" style="height:26px"/></a>
      <nav class="foot-links">
        <a href="{home}index.html#valor">Producto</a>
        <a href="{home}index.html#precios">Precios</a>
        <a href="{home}blog/index.html">Blog</a>
        <a href="{wa}" target="_blank" rel="noopener noreferrer">Contacto</a>
      </nav>
    </div>
    <div class="foot-legal">© {year} Qomers · El copiloto de WhatsApp para tu e-commerce</div>
  </div>
</footer>'''

def head(title, description, canonical, keywords="", og_type="website", extra_ld="", depth=1, og_image="", article_meta=None):
    css = "../" * depth + "css/styles.css"
    bcss = "../" * depth + "blog/blog.css"
    kw = f'\n<meta name="keywords" content="{esc(keywords)}">' if keywords else ""
    img = f'\n<meta property="og:image" content="{esc(og_image)}">\n<meta name="twitter:image" content="{esc(og_image)}">' if og_image else ""
    ameta = ""
    if article_meta:
        ameta = (f'\n<meta property="article:published_time" content="{esc(article_meta["published"])}">'
                 f'\n<meta property="article:modified_time" content="{esc(article_meta["modified"])}">'
                 f'\n<meta property="article:author" content="{esc(article_meta["author"])}">'
                 f'\n<meta property="article:section" content="{esc(article_meta["section"])}">')
    return f'''<!DOCTYPE html>
<html lang="es" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">{kw}
<link rel="canonical" href="{esc(canonical)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#FBFBF9">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Qomers">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(canonical)}">
<meta property="og:locale" content="es_AR">{img}{ameta}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{css}">
<link rel="stylesheet" href="{bcss}">
{extra_ld}
</head>
<body>'''

# --- Article body renderer --------------------------------------------------
def linkify(text, links):
    """Reemplaza {{clave}} en el texto por <a href> usando el mapa `links`.
    links: { "clave": {"url": "...", "external": true/false} }"""
    if not links:
        return esc(text)
    # Escapamos primero, luego insertamos los <a> (que no deben escaparse)
    out = esc(text)
    for key, meta in links.items():
        token = esc("{{" + key + "}}")
        label = esc(key)
        url = meta["url"]
        if meta.get("external"):
            a = f'<a href="{esc(url)}" target="_blank" rel="noopener">{label}</a>'
        else:
            a = f'<a href="{esc(url)}">{label}</a>'
        out = out.replace(token, a)
    return out

def render_body(blocks):
    out = []
    for b in blocks:
        t = b["type"]
        links = b.get("links")
        if t == "lead":
            out.append(f'<p class="art-lead">{linkify(b["text"], links)}</p>')
        elif t == "p":
            out.append(f'<p>{linkify(b["text"], links)}</p>')
        elif t == "h2":
            out.append(f'<h2>{esc(b["text"])}</h2>')
        elif t == "h3":
            out.append(f'<h3>{esc(b["text"])}</h3>')
        elif t == "callout":
            out.append(f'<blockquote class="art-callout">{esc(b["text"])}</blockquote>')
        elif t == "ul":
            lis = "".join(f'<li>{linkify(i, links)}</li>' for i in b["items"])
            out.append(f'<ul class="art-ul">{lis}</ul>')
        elif t == "pl":
            rows = []
            for r in b["rows"]:
                cls = {"down":"v-down","up":"v-up","total":"v-total","neutral":""}.get(r.get("kind",""),"")
                rowcls = "pl-row total" if r.get("kind")=="total" else "pl-row"
                rows.append(f'<div class="{rowcls}"><span class="k">{esc(r["k"])}</span><span class="v {cls}">{esc(r["v"])}</span></div>')
            out.append(f'<div class="art-pl">{"".join(rows)}</div>')
    return "\n".join(out)

# --- JSON-LD ----------------------------------------------------------------
def article_ld(a, url, base):
    data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": a["title"],
        "description": a["description"],
        "datePublished": a["date_iso"],
        "dateModified": a.get("modified_iso", a["date_iso"]),
        "author": {"@type": "Organization", "name": "Qomers"},
        "publisher": {
            "@type": "Organization",
            "name": "Qomers",
            "logo": {"@type": "ImageObject", "url": f"{base}/favicon.png"}
        },
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "articleSection": a.get("category", "Blog"),
        "inLanguage": "es"
    }
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>'

def breadcrumb_ld(a, url, base):
    data = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Inicio", "item": base + "/"},
            {"@type": "ListItem", "position": 2, "name": "Blog", "item": base + "/blog/"},
            {"@type": "ListItem", "position": 3, "name": a["title"], "item": url}
        ]
    }
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>'

def blog_ld(site, articles, url):
    data = {
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": site["blog_title"],
        "description": site["blog_description"],
        "url": url,
        "inLanguage": "es",
        "blogPost": [
            {"@type": "BlogPosting", "headline": a["title"], "datePublished": a["date_iso"],
             "url": f'{site["base_url"]}/blog/{a["slug"]}/', "description": a["description"]}
            for a in articles
        ]
    }
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>'

# --- Page builders ----------------------------------------------------------
def build_article(a, site):
    base = site["base_url"]
    url = f'{base}/blog/{a["slug"]}/'
    wa = site["wa"]
    ld = article_ld(a, url, base) + "\n" + breadcrumb_ld(a, url, base)
    og_image = f'{base}/blog/{a["slug"]}/social.svg'
    article_meta = {
        "published": a["date_iso"],
        "modified": a.get("modified_iso", a["date_iso"]),
        "author": site["author"],
        "section": a.get("category", "Blog"),
    }
    h = head(a["seo_title"], a["description"], url, a.get("keywords",""), "article", ld,
             depth=2, og_image=og_image, article_meta=article_meta)
    n = nav(2).replace("{wa}", wa)
    f = footer(2, wa)

    stats = ""
    if a.get("hero_stat_1"):
        stats = f'''<div class="art-stats">
          <div class="art-stat"><span class="art-stat-n">{esc(a["hero_stat_1"])}</span><span class="art-stat-l">{esc(a["hero_stat_1_label"])}</span></div>
          <div class="art-stat"><span class="art-stat-n">{esc(a["hero_stat_2"])}</span><span class="art-stat-l">{esc(a["hero_stat_2_label"])}</span></div>
        </div>'''

    body = render_body(a["body"])

    page = f'''{h}
{n}
<main class="art">
  <div class="art-wrap">
    <nav class="art-crumbs" aria-label="Breadcrumb">
      <a href="../../index.html">Inicio</a> <span>/</span>
      <a href="../index.html">Blog</a> <span>/</span>
      <span class="art-crumbs-here">{esc(a["category"])}</span>
    </nav>
    <span class="eyebrow">{esc(a["category"])}</span>
    <h1 class="art-title">{esc(a["title"])}</h1>
    <div class="art-meta">
      <span class="art-tag">{esc(a["tag"])}</span>
      <span class="art-dot">·</span>
      <time datetime="{esc(a["date_iso"])}">{esc(a["date_display"])}</time>
      <span class="art-dot">·</span>
      <span>{a["read_minutes"]} min de lectura</span>
    </div>
    {stats}
    <article class="art-body">
      {body}
    </article>
    <aside class="art-cta">
      <h3>Calculá tu margen real, sin planillas</h3>
      <p>Conectá tu tienda y dejá que Qomers te muestre cuánto ganás de verdad en cada venta —por WhatsApp.</p>
      <a class="btn btn-lime" href="{wa}" target="_blank" rel="noopener noreferrer">Conectar mi tienda <span class="chev">›</span></a>
    </aside>
    <a class="art-back" href="../index.html">← Volver al blog</a>
  </div>
</main>
{f}
</body>
</html>'''
    outdir = os.path.join(BLOG, a["slug"])
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "index.html"), "w", encoding="utf-8") as fp:
        fp.write(page)
    # Social share image (1200x630) — branded, title on brand background
    write_social_svg(outdir, a, site)
    return url

def write_social_svg(outdir, a, site):
    """Genera una og:image 1200x630 con el título del artículo sobre fondo de marca."""
    title = a["title"]
    # wrap title into lines (~26 chars)
    words = title.split()
    lines, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= 26:
            cur = (cur + " " + w).strip()
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    lines = lines[:4]
    tspans = "".join(
        f'<tspan x="80" dy="{0 if i==0 else 74}">{esc(l)}</tspan>'
        for i, l in enumerate(lines))
    cat = esc(a.get("category","").upper())
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0F1412"/>
  <rect x="0" y="0" width="1200" height="8" fill="#79C900"/>
  <text x="80" y="120" font-family="'Space Grotesk',sans-serif" font-size="26" font-weight="700" letter-spacing="3" fill="#79C900">{cat}</text>
  <text x="80" y="250" font-family="'Space Grotesk',sans-serif" font-size="58" font-weight="700" fill="#FBFBF9">{tspans}</text>
  <text x="80" y="560" font-family="'Space Grotesk',sans-serif" font-size="34" font-weight="700" fill="#FBFBF9">Qomers</text>
  <text x="80" y="595" font-family="'Inter',sans-serif" font-size="20" fill="#8A928D">El copiloto de WhatsApp para tu e-commerce</text>
</svg>'''
    with open(os.path.join(outdir, "social.svg"), "w", encoding="utf-8") as fp:
        fp.write(svg)

def build_index(site, articles):
    base = site["base_url"]
    url = f'{base}/blog/'
    wa = site["wa"]
    ld = blog_ld(site, articles, url)
    h = head(f'{site["blog_title"]} · Estrategia y casos de e-commerce',
             site["blog_description"], url, "", "website", ld, depth=1)
    n = nav(1).replace("{wa}", wa)
    f = footer(1, wa)

    cards = []
    for a in articles:
        featured = " art-card-feat" if a.get("featured") else ""
        cards.append(f'''<a class="art-card{featured}" href="{esc(a["slug"])}/index.html">
        <span class="art-card-cat">{esc(a["category"])}</span>
        <h2 class="art-card-title">{esc(a["title"])}</h2>
        <p class="art-card-desc">{esc(a["description"])}</p>
        <div class="art-card-meta">
          <time datetime="{esc(a["date_iso"])}">{esc(a["date_display"])}</time>
          <span class="art-dot">·</span>
          <span>{a["read_minutes"]} min</span>
        </div>
      </a>''')

    page = f'''{h}
{n}
<main class="blog">
  <div class="blog-wrap">
    <header class="blog-head">
      <span class="eyebrow">Blog</span>
      <h1>Estrategia real para vender más y con mejor margen.</h1>
      <p>Casos reales, guías prácticas y tácticas para tu e-commerce en Mercado Libre, Shopify, WooCommerce y Tiendanube.</p>
    </header>
    <div class="art-grid">
      {"".join(cards)}
    </div>
  </div>
</main>
{f}
</body>
</html>'''
    with open(os.path.join(BLOG, "index.html"), "w", encoding="utf-8") as fp:
        fp.write(page)
    return url

def build_sitemap(site, articles):
    base = site["base_url"]
    urls = [(base + "/", "1.0"), (base + "/blog/", "0.8")]
    for a in articles:
        urls.append((f'{base}/blog/{a["slug"]}/', "0.7"))
    items = "\n".join(
        f'  <url><loc>{u}</loc><changefreq>weekly</changefreq><priority>{p}</priority></url>'
        for u, p in urls)
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{items}
</urlset>
'''
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as fp:
        fp.write(xml)

def build_robots(site):
    txt = f'''User-agent: *
Allow: /

Sitemap: {site["base_url"]}/sitemap.xml
'''
    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as fp:
        fp.write(txt)

def main():
    data = load()
    site = data["site"]
    # newest first
    articles = sorted(data["articles"], key=lambda a: a["date_iso"], reverse=True)
    for a in articles:
        build_article(a, site)
    build_index(site, articles)
    build_sitemap(site, articles)
    build_robots(site)
    print(f"Built {len(articles)} article(s) + index + sitemap + robots.")
    for a in articles:
        print(f"  /blog/{a['slug']}/")

if __name__ == "__main__":
    main()
