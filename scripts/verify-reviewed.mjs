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
const primaryDomains = [
  "aramco.com", "slb.com", "s-oil.com", "worldbank.org", "api.org",
  "eurecat.com", "gs1.org", "dupont.com", "who.int", "nist.gov",
  "cdc.gov", "airliquide.com", "iea.org",
  "energy.gov", "osha.gov", "epa.gov", "usgs.gov",
  "cyber.gov.au", "eia.gov",
];
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
  assert.ok(new Date(review.reviewedAt).getTime() <= Date.now(), "Review timestamp must not be in the future");
  assert.equal(dom("article h1").text().trim(), review.title || post.title, "Reviewed title");
  assert.equal(articleData.headline, review.title || post.title, "Structured data title");
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
  // This checks our article format, not an AdSense minimum source count.
  assert.ok(sources.length >= 2, "Claim-specific primary sources");
  for (const source of sources) {
    assert.ok(dom(`a[href="#${dom(source).attr("id")}"]`).length, "Every listed source supports a cited claim");
    const url = new URL(dom(source).find("a").attr("href"));
    assert.equal(url.protocol, "https:");
    assert.ok(primaryDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)), `Primary-source domain: ${url.hostname}`);
  }
  for (const anchor of dom('article a[href^="/"]').toArray()) {
    const route = decodeURIComponent(dom(anchor).attr("href").split("#")[0]);
    assert.ok((await stat(path.join(dist, route, "index.html"))).isFile(), `Internal link: ${route}`);
  }
  const reviewDay = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(review.reviewedAt));
  assert.equal(dom(".article-byline time").text().trim(), reviewDay, "Visible review day uses Korean time on every build host");
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
const calculationExamples = [
  ["76", /(1,200,000 - 1,000,000)/, "40달러/tCO2e", (1200000 - 1000000) / (10000 - 5000), 40],
  ["70", /정시이면서 완전한 주문 수/, "93%", 93 / 100 * 100, 93],
  ["68", /45 ÷ 100/, "99.5%", (1 - 175 / 35000) * 100, 99.5],
  ["67", /55 - 50/, "10%", (55 - 50) / 50 * 100, 10],
  ["62", /176\.5 × 0\.95 × 0\.90/, "150.9kg", Math.round(176.5 * 0.95 * 0.9 * 10) / 10, 150.9],
  ["2", /140 - 50/, "64.3%", Math.round((140 - 50) / 140 * 1000) / 10, 64.3],
  ["66", /9 ÷ 19/, "47.4%", Math.round(9 / 19 * 1000) / 10, 47.4],
  ["47", /40 × 235 × 0\.001/, "9.4kg", 40 * 235 * 0.001, 9.4],
  ["51", /100 - 40 - 25 - 5/, "= 30", 100 - 40 - 25 - 5, 30],
  ["12", /10억 ÷ 5,000만/, "20년", 1000000000 / 50000000, 20],
];
for (const [id, expression, displayed, result, expected] of calculationExamples) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  assert.match(content, expression, `Published calculation expression: ${id}`);
  assert.ok(content.includes(displayed), `Published result: ${id}`);
  assert.equal(result, expected, `Calculation arithmetic: ${id}`);
  assert.match(content, /가상/, `Illustrative data disclosure: ${id}`);
}
const safetyReviews = {
  "56": [/현장 적용 경험은 확인 가능한 근거가 없어/, /2026년의 적용 규격이나 인증 요건으로 재게시하지 않는다/, /설비 운전·점검 매뉴얼이 아니다/],
  "66": [/측정 정확도를 평가하는 시험은 아니/, /경보 농도를 제시하지 않는다/, /미검출 1건/, /98\.9%/],
  "47": [/62억 갤런/, /같은 성과로 합산하지 않는다/, /음용 적합성은 별도의 평가 영역/, /0\.6 \+ 9\.4 = 10kg/],
};
for (const [id, claims] of Object.entries(safetyReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Safety and evidence boundary: ${id}`);
  assert.doesNotMatch(content, /제가 (?:처음|확인|직접)|지난 프로젝트 당시|직접 현장에 적용|원천 봉쇄|무결점의 안전망/, `No unverified experience or safety guarantee: ${id}`);
}
assert.equal((9 + 980) / 1000 * 100, 98.9, "Gas example accuracy");
assert.equal(9 + 1 + 10 + 980, 1000, "Gas example totals");
assert.equal(100 * 100 * 0.001, 60 * 10 * 0.001 + 40 * 235 * 0.001, "Water example mass balance");
const evidenceReviews = {
  "73": [/현장 네트워크의 설정·격리 지침이 아니다/, /2026년 9월 안내는 Rev\. 4의 초기 공개 초안/, /실제 내부 구성|실제 방화벽 구성/],
  "51": [/ISPA를 Integrated Supply and Production Analysis라고 풀어 설명했다/, /가능한 모든 회사 자료에 해당 명칭이 없다는 판정은 아니다/, /60 ÷ 80 = 75%/, /40 - 10 = 30/],
  "12": [/두 명칭이 같은 유전을 가리킨다는 공식 대응표를 확보한 것은 아니다/, /48,254mmbbl/, /58,319mmboe/, /3\.800mmbpd/, /2018-12-31 기준/, /1억 × 30% = 3,000만 배럴/],
};
for (const [id, claims] of Object.entries(evidenceReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Evidence and correction scope: ${id}`);
  assert.doesNotMatch(content, /제가 (?:직접|지난)|1cm 단위의 오차도 없이|최소 5개 이상의 보안 레이어/, `No unsupported experience or architecture: ${id}`);
}
assert.equal((65 - 40) + (100 - 65 - 25 - 5), (80 - 40) + (100 - 80 - 25 - 5), "Internal-price example totals");
assert.equal(60 / 80 * 100, 75, "Feedstock example denominator");
assert.equal(100000000 * 0.3, 30000000, "Illustrative recovery arithmetic");
console.log(JSON.stringify({ articles: posts.length, reviewed: report, unchangedLegacyArticles: legacy.length, legacyHash }, null, 2));
