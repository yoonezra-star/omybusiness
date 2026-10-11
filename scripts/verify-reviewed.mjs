import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const posts = JSON.parse(await readFile(path.join(root, "data/posts.json"), "utf8"));
const reviews = JSON.parse(await readFile(path.join(root, "data/article-reviews.json"), "utf8"));
const site = JSON.parse(await readFile(path.join(root, "data/site.json"), "utf8"));
const sitemap = cheerio.load(await readFile(path.join(dist, "sitemap.xml"), "utf8"), { xmlMode: true });
const reviewIds = new Set(reviews.map((review) => review.id));
const legacy = [];
const report = [];
assert.equal(reviewIds.size, reviews.length, "Review IDs must be unique");

for (const post of posts) {
  const html = await readFile(path.join(dist, post.routePath, "index.html"), "utf8");
  const dom = cheerio.load(html);
  const stylePath = dom('link[rel="stylesheet"]').attr("href");
  assert.match(stylePath, /^\/assets\/style\.[a-f0-9]{12}\.css$/, "Content-versioned stylesheet");
  assert.ok((await stat(path.join(dist, stylePath))).isFile(), "Referenced stylesheet exists");
  const canonical = `${site.url}${encodeURI(post.routePath)}`;
  assert.equal(dom('link[rel="canonical"]').attr("href"), canonical, `Preserve route: ${post.id}`);
  const articleData = dom('script[type="application/ld+json"]').toArray()
    .map((element) => JSON.parse(dom(element).text())).find((item) => item["@type"] === "BlogPosting");
  assert.equal(articleData.datePublished, post.publishedAt, `Preserve original publication date: ${post.id}`);

  if (!reviewIds.has(post.id)) {
    legacy.push([post.id, dom(".entry-content").html(), canonical]);
    continue;
  }
  const review = reviews.find((item) => item.id === post.id);
  assert.equal(dom("[data-review-id]").attr("data-review-id"), post.id);
  assert.equal(dom(".article-byline a[rel=author]").attr("href"), "/author/");
  assert.match(dom(".article-disclosure").text(), /AI 보조 작성/);
  assert.equal(dom(".article-byline time").attr("datetime"), review.reviewedAt);
  assert.equal(articleData.dateModified, review.reviewedAt);
  const sitemapEntry = sitemap("url").toArray().find((entry) => sitemap(entry).find("loc").text() === canonical);
  assert.ok(sitemapEntry, `Sitemap entry: ${post.id}`);
  assert.equal(sitemap(sitemapEntry).find("lastmod").text(), new Date(review.reviewedAt).toISOString());
  assert.equal(dom(".content-enhancement, .deep-analysis, .article-brief, .editor-note").length, 0, "No legacy filler in reviewed articles");
  assert.equal(dom(".article-findings li").length, review.takeaways.length);
  assert.ok(dom(".entry-content h2").length >= 5, "Substantive article sections");
  assert.ok(dom(".analysis-table").length >= 2, "Topic-specific comparison tables");
  dom(".analysis-table").each((_, table) => {
    assert.ok(dom(table).find("caption").text().trim(), "Table captions");
    assert.ok(dom(table).find('th[scope="col"]').length, "Column headers");
    assert.ok(dom(table).find('th[scope="row"]').length, "Row headers");
    assert.equal(dom(table).parent().attr("tabindex"), "0", "Keyboard-accessible table scroll region");
  });
  const ids = dom("[id]").toArray().map((element) => dom(element).attr("id"));
  assert.equal(new Set(ids).size, ids.length, `Unique anchor IDs: ${post.id}`);
  for (const anchor of dom('a[href^="#"]').toArray()) {
    assert.ok(ids.includes(dom(anchor).attr("href").slice(1)), `Anchor destination: ${post.id}`);
  }
  const sources = dom(".evidence-list > li").toArray();
  assert.ok(sources.length >= 4, "Specific primary sources");
  for (const source of sources) {
    assert.ok(dom(`a[href="#${dom(source).attr("id")}"]`).length, "Every listed source supports a cited claim");
    const url = new URL(dom(source).find("a").attr("href"));
    assert.equal(url.protocol, "https:");
    assert.ok(["aramco.com", "slb.com", "s-oil.com"].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)));
  }
  for (const anchor of dom('article a[href^="/"]').toArray()) {
    const route = decodeURIComponent(dom(anchor).attr("href").split("#")[0]);
    assert.ok((await stat(path.join(dist, route, "index.html"))).isFile(), `Internal link: ${route}`);
  }
  const reviewDay = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(review.reviewedAt));
  assert.ok(dom(".evidence-note").text().includes(reviewDay), "Visible source check date matches metadata");
  report.push({ id: post.id, bodyCharacters: dom(".entry-content").text().replace(/\s/g, "").length, tables: dom(".analysis-table").length, sources: sources.length });
}

const legacyHash = createHash("sha256").update(JSON.stringify(legacy)).digest("hex");
const expectedHash = process.argv[2];
if (expectedHash) assert.equal(legacyHash, expectedHash, "Unreviewed article bodies and canonical URLs must remain unchanged");
assert.equal(report.length, reviews.length, "Every review must be published");
const corrections = cheerio.load(await readFile(path.join(dist, "corrections/index.html"), "utf8"));
assert.equal(corrections(".review-history > li").length, reviews.length, "Published correction history");
for (const [name, expected] of [["84.html", /100 - 70/], ["81.html", /35 - 30/], ["83.html", /5,324억 원/]]) {
  assert.match(await readFile(path.join(root, "data/reviewed", name), "utf8"), expected);
}
console.log(JSON.stringify({ articles: posts.length, reviewed: report, unchangedLegacyArticles: legacy.length, legacyHash }, null, 2));
