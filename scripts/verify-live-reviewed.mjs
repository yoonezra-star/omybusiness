import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const posts = JSON.parse(await readFile(path.join(root, "data/posts.json"), "utf8"));
const reviews = JSON.parse(await readFile(path.join(root, "data/article-reviews.json"), "utf8"));
const site = JSON.parse(await readFile(path.join(root, "data/site.json"), "utf8"));
const ids = process.argv.slice(2);
assert.ok(ids.length > 0 && new Set(ids).size === ids.length, "Provide distinct reviewed article IDs");
const report = [];
for (const id of ids) {
  const post = posts.find(item => item.id === id);
  const review = reviews.find(item => item.id === id);
  assert.ok(post && review, `Reviewed article exists: ${id}`);
  const url = `${site.url}${encodeURI(post.routePath)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `Live HTTP response: ${id}`);
  const live = cheerio.load(await response.text());
  const local = cheerio.load(await readFile(path.join(root, "dist", post.routePath, "index.html"), "utf8"));
  assert.equal(live("[data-review-id]").attr("data-review-id"), id);
  assert.equal(live("article h1").text(), local("article h1").text());
  assert.equal(live('link[rel="canonical"]').attr("href"), url);
  assert.equal(live(".article-byline time").attr("datetime"), review.reviewedAt);
  assert.equal(live(".article-byline time").text(), local(".article-byline time").text());
  assert.equal(live(".entry-content").html(), local(".entry-content").html(), `Published body matches build: ${id}`);
  assert.equal(live('link[rel="stylesheet"]').attr("href"), local('link[rel="stylesheet"]').attr("href"));
  const data = live('script[type="application/ld+json"]').toArray()
    .map(element => JSON.parse(live(element).text())).find(item => item["@type"] === "BlogPosting");
  assert.equal(data.datePublished, post.publishedAt);
  assert.equal(data.dateModified, review.reviewedAt);
  report.push({ id, url: response.url, status: response.status, title: data.headline,
    reviewedAt: data.dateModified, tables: live(".analysis-table").length,
    sources: live(".evidence-list > li").length,
    bodyHash: createHash("sha256").update(live(".entry-content").html()).digest("hex") });
}
console.log(JSON.stringify({ verification: "Published HTML parity, not browser rendering", articles: report }, null, 2));
