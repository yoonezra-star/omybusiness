import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const site = JSON.parse(await readFile(path.join(root, "data/site.json"), "utf8"));
const posts = JSON.parse(await readFile(path.join(root, "data/posts.json"), "utf8"));
const reviews = JSON.parse(await readFile(path.join(root, "data/article-reviews.json"), "utf8"));
const dom = cheerio.load(await readFile(path.join(dist, "author/index.html"), "utf8"));
const author = dom(".author-page");
assert.equal(author.length, 1);
assert.equal(author.find("[data-author-name]").text().trim(), site.title);
assert.equal(author.find(".page-summary").length, 0, "Profile facts replace generic summary labels");
assert.equal(Number(author.find("[data-author-total-count]").text()), posts.length);
assert.equal(Number(author.find("[data-author-review-count]").text()), reviews.length);
assert.equal(Number(author.find("[data-author-pending-count]").text()), posts.length - reviews.length);
const text = author.text().replace(/\s+/g, " ");
assert.match(text, /사이트 브랜드이자 글에 사용하는 공개 표시명/);
assert.match(text, /AI 보조 작성/);
assert.match(text, /외부 검증이나 모든 글의 검토 완료를 뜻하지 않습니다/);
assert.match(text, /확인되지 않은 학력·자격·근무 경력도 전문성의 근거로 내세우지 않습니다/);
assert.match(text, /직접 수행한 설비 시험이나 독립적인 성능 검증으로 제시하지 않습니다/);
assert.deepEqual(author.find('a[href^="mailto:"]').toArray().map(anchor => dom(anchor).attr("href")), ["mailto:yoonezra@gmail.com"], "Only the existing public contact address is used");

const examples = author.find("[data-author-example]").toArray();
assert.equal(examples.length, 3);
for (const example of examples) {
  const id = dom(example).attr("data-author-example");
  const post = posts.find(item => item.id === id);
  const review = reviews.find(item => item.id === id);
  assert.ok(post && review, "Only published reviewed articles serve as work samples");
  assert.equal(dom(example).find("a").attr("href"), encodeURI(post.routePath));
  assert.equal(dom(example).find("a").text(), review.title || post.title);
}
for (const anchor of author.find('a[href^="/"]').toArray()) {
  const route = decodeURI(dom(anchor).attr("href").split(/[?#]/)[0]);
  assert.ok((await stat(path.join(dist, route, "index.html"))).isFile(), `Profile link exists: ${route}`);
}

const profileTime = author.find(".article-byline time");
const modifiedAt = profileTime.attr("datetime");
assert.ok(Number.isFinite(new Date(modifiedAt).getTime()));
assert.ok(new Date(modifiedAt).getTime() <= Date.now(), "Profile date is not in the future");
for (const review of reviews) {
  assert.ok(new Date(modifiedAt) >= new Date(review.reviewedAt), "Profile date reflects its review inventory");
}
const day = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(modifiedAt));
assert.equal(profileTime.text(), day);
const sitemap = cheerio.load(await readFile(path.join(dist, "sitemap.xml"), "utf8"), { xmlMode: true });
const sitemapEntry = sitemap("url").toArray().find(entry => sitemap(entry).find("loc").text() === `${site.url}/author/`);
assert.ok(sitemapEntry);
assert.equal(sitemap(sitemapEntry).find("lastmod").text(), new Date(modifiedAt).toISOString());
const schemas = dom('script[type="application/ld+json"]').toArray().map(element => JSON.parse(dom(element).text()));
const entities = schemas.flatMap(schema => schema["@graph"] || [schema]);
const organization = entities.find(entity => entity["@id"] === `${site.url}/#organization`);
assert.equal(organization["@type"], "Organization");
assert.equal(organization.name, site.title);
assert.ok(!entities.some(entity => entity["@type"] === "Person"), "No invented personal identity in structured data");
for (const review of reviews) {
  const post = posts.find(item => item.id === review.id);
  const article = cheerio.load(await readFile(path.join(dist, post.routePath, "index.html"), "utf8"));
  assert.equal(article('.article-byline a[rel="author"]').text(), site.title, "Reviewed bylines use the same public display name");
}
console.log(JSON.stringify({ author: organization.name, articles: posts.length, reviewed: reviews.length, pending: posts.length - reviews.length, examples: examples.length, modifiedAt }, null, 2));
