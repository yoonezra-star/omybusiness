import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const site = JSON.parse(await readFile(path.join(root, "data", "site.json"), "utf8"));
const posts = JSON.parse(await readFile(path.join(root, "data", "posts.json"), "utf8"));
const pages = JSON.parse(await readFile(path.join(root, "data", "pages.json"), "utf8"));

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absoluteUrl(routePath = "/") {
  return `${site.url}${routePath === "/" ? "" : encodeURI(routePath)}`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(dateString));
}

function routeToFile(routePath) {
  const decoded = decodeURIComponent(routePath);
  const segments = decoded.split("/").filter(Boolean);
  return path.join(dist, ...segments, "index.html");
}

async function writeRoute(routePath, html) {
  const file = routeToFile(routePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
}

function layout({ title, description, routePath = "/", image = "", body, type = "website", extraHead = "" }) {
  const pageTitle = title === site.title ? site.title : `${title} | ${site.title}`;
  const canonical = absoluteUrl(routePath);
  const socialImage = image ? absoluteUrl(image) : "";

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description || site.description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="${escapeHtml(site.title)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description || site.description)}">
  <meta property="og:url" content="${canonical}">
  ${socialImage ? `<meta property="og:image" content="${socialImage}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/assets/style.css">
  ${extraHead}
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/">
        <strong>${escapeHtml(site.title)}</strong>
        <span>Middle East business intelligence</span>
      </a>
      <nav class="nav" aria-label="주요 메뉴">
        <a href="/">홈</a>
        <a href="/category/회사/">회사</a>
        ${pages.map((page) => `<a href="${encodeURI(page.routePath)}">${escapeHtml(page.title)}</a>`).join("")}
      </nav>
    </div>
  </header>
  <main class="main">
${body}
  </main>
  <footer class="site-footer">
    <p>© AXZ Corp. Migrated from Tistory to Cloudflare Pages.</p>
  </footer>
</body>
</html>`;
}

function postCard(post) {
  return `<article class="post-card" data-title="${escapeHtml(post.title.toLowerCase())}">
  <a href="${encodeURI(post.routePath)}">
    ${post.image ? `<img src="${post.image}" alt="${escapeHtml(post.title)}" loading="lazy">` : ""}
    <div class="post-card-body">
      <div class="meta"><span>${escapeHtml(formatDate(post.publishedAt))}</span><span class="pill">${escapeHtml(post.category)}</span></div>
      <h2>${escapeHtml(post.title)}</h2>
      <p>${escapeHtml(post.description)}</p>
    </div>
  </a>
</article>`;
}

function renderIndex(filteredPosts = posts, title = site.title, routePath = "/") {
  const body = `  <section class="intro">
    <h1>${escapeHtml(site.title)}</h1>
    <p>${escapeHtml(site.description)}</p>
  </section>
  <section>
    <div class="toolbar">
      <input class="search" id="postSearch" type="search" placeholder="글 검색" aria-label="글 검색">
      <span class="count">전체 ${filteredPosts.length}개 글</span>
    </div>
    <div class="post-grid" id="postGrid">
      ${filteredPosts.map(postCard).join("\n")}
    </div>
  </section>
  <script>
    const input = document.getElementById("postSearch");
    const cards = [...document.querySelectorAll(".post-card")];
    input?.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      cards.forEach((card) => {
        card.hidden = query && !card.dataset.title.includes(query);
      });
    });
  </script>`;

  return layout({ title, description: site.description, routePath, body });
}

function renderPost(post, index) {
  const previous = posts[index + 1];
  const next = posts[index - 1];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url: absoluteUrl(post.routePath),
    datePublished: post.publishedAt,
    dateModified: post.modifiedAt || post.publishedAt,
    author: { "@type": "Person", name: "omybusiness" },
    publisher: { "@type": "Organization", name: site.title },
    image: post.image ? absoluteUrl(post.image) : undefined,
  };

  const body = `  <article class="article">
    <header class="article-header">
      <div class="meta"><span>${escapeHtml(formatDate(post.publishedAt))}</span><span class="pill">${escapeHtml(post.category)}</span></div>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="article-description">${escapeHtml(post.description)}</p>
    </header>
    <div class="entry-content">
      ${post.content}
    </div>
    <nav class="article-nav" aria-label="글 이동">
      <span>${previous ? `<a href="${encodeURI(previous.routePath)}">이전 글: ${escapeHtml(previous.title)}</a>` : ""}</span>
      <span>${next ? `<a href="${encodeURI(next.routePath)}">다음 글: ${escapeHtml(next.title)}</a>` : ""}</span>
    </nav>
  </article>`;

  return layout({
    title: post.title,
    description: post.description,
    routePath: post.routePath,
    image: post.image,
    type: "article",
    body,
    extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  });
}

function renderPage(page) {
  const body = `  <article class="page">
    <header class="page-header">
      <h1>${escapeHtml(page.title)}</h1>
      <p class="article-description">${escapeHtml(page.description)}</p>
    </header>
    <div class="entry-content">
      ${page.content}
    </div>
  </article>`;
  return layout({ title: page.title, description: page.description, routePath: page.routePath, body });
}

function renderSitemap() {
  const items = [
    { routePath: "/", modifiedAt: site.migratedAt },
    ...pages,
    ...posts,
    { routePath: "/category/회사/", modifiedAt: site.migratedAt },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items
  .map(
    (item) => `  <url>
    <loc>${absoluteUrl(item.routePath)}</loc>
    ${item.modifiedAt ? `<lastmod>${new Date(item.modifiedAt).toISOString()}</lastmod>` : ""}
  </url>`,
  )
  .join("\n")}
</urlset>
`;
}

function renderRss() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(site.title)}</title>
    <link>${site.url}</link>
    <description>${escapeHtml(site.description)}</description>
    <language>ko</language>
    ${posts
      .slice(0, 30)
      .map(
        (post) => `<item>
      <title>${escapeHtml(post.title)}</title>
      <link>${absoluteUrl(post.routePath)}</link>
      <description>${escapeHtml(post.description)}</description>
      <category>${escapeHtml(post.category)}</category>
      <guid isPermaLink="true">${absoluteUrl(post.routePath)}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
    </item>`,
      )
      .join("\n")}
  </channel>
</rss>
`;
}

function renderRedirects() {
  const lines = posts.flatMap((post) => {
    const rows = [];
    if (post.numericPath) rows.push(`${post.numericPath} ${encodeURI(post.routePath)} 301`);
    rows.push(`/m${encodeURI(post.routePath)} ${encodeURI(post.routePath)} 301`);
    return rows;
  });
  lines.push("/rss.xml /rss.xml 200");
  return `${lines.join("\n")}\n`;
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });
await cp(path.join(root, "public"), dist, { recursive: true, force: true });
await cp(path.join(root, "src", "styles.css"), path.join(dist, "assets", "style.css"));

await writeRoute("/", renderIndex());
await writeRoute("/category/회사/", renderIndex(posts.filter((post) => post.category === "회사"), "회사", "/category/회사/"));
await writeRoute("/tag/", renderIndex(posts, "태그", "/tag/"));

for (const [index, post] of posts.entries()) {
  await writeRoute(post.routePath, renderPost(post, index));
}

for (const page of pages) {
  await writeRoute(page.routePath, renderPage(page));
}

await writeFile(path.join(dist, "sitemap.xml"), renderSitemap());
await writeFile(path.join(dist, "rss.xml"), renderRss());
await writeFile(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
await writeFile(path.join(dist, "_redirects"), renderRedirects());
await writeFile(path.join(dist, "404.html"), layout({
  title: "페이지를 찾을 수 없습니다",
  description: site.description,
  body: `  <section class="intro"><h1>페이지를 찾을 수 없습니다</h1><p><a href="/">홈으로 이동</a></p></section>`,
}));

console.log(`Built ${posts.length} posts, ${pages.length} pages into dist/.`);
