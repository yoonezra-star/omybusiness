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
  "cyber.gov.au", "eia.gov", "isa100wci.org", "yokogawa.com",
  "astm.org", "imo.org", "aramcotrading.com", "iso.org", "cimac.com", "gao.gov",
  "totalenergies.com", "iscc-system.org",
  "acwapower.com",
  "opm-project.org",
  "repsol.com", "icao.int", "ascent.aero",
  "vakt.com", "asmo.com",
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
  if (post.id === "53") {
    assert.deepEqual(dom(".analysis-table .quantity").toArray().map(element => dom(element).text()),
      ["7.3mmbpd", "7.4mmbpd", "6.0mmbpd", "6.3mmbpd"], "Keep reported number and unit together");
  }
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
  ["80", /\(990 - 20\) ÷ 1,000/, "97%", (990 - 20) / 1000 * 100, 97],
  ["60", /\(40 - 39\) ÷ 40/, "2.5%", (40 - 39) / 40 * 100, 2.5],
  ["69", /100 - 70 = 30/, "70%", 70 / 100 * 100, 70],
  ["65", /\(180 \+ 40 \+ 60\) × 3/, "840", (180 + 40 + 60) * 3, 840],
  ["61", /570 ÷ 37\.5/, "15.2달러/GJ", 570 / 37.5, 15.2],
  ["59", /\(26 - 20\) ÷ 26/, "23.1%", Math.round((26 - 20) / 26 * 1000) / 10, 23.1],
  ["58", /60 ÷ 80 = 75%/, "= 5,000", 60000 + 10000 - 65000, 5000],
  ["55", /90 ÷ 95/, "94.7%", Math.round(90 / 95 * 1000) / 10, 94.7],
  ["53", /\(7\.4 - 7\.3\) ÷ 7\.3/, "1.4%", Math.round((7.4 - 7.3) / 7.3 * 1000) / 10, 1.4],
  ["50", /75 ÷ 90 ≈ 83\.3%/, "12 ÷ 20 = 60%", Math.round(75 / 90 * 1000) / 10, 83.3],
  ["49", /0\.8 ÷ \(0\.20 \+ 0\.05\) = 3\.2시간/, "-6,000달러", 0.8 / (0.2 + 0.05), 3.2],
  ["39", /7,200,000 ÷ \(400,000 × 30\)/, "60%", 7200000 / (400000 * 30) * 100, 60],
  ["18", /8 ÷ 2\.5 = 3\.2배/, "3.2 ÷ 4 = 80%", 8 / 2.5 / (512 / 128) * 100, 80],
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
const controlCapacityReviews = {
  "80": [/Fadhili 가스플랜트/, /2021년 원격 유전/, /23±2°C/, /IO 모드/, /아람코 전체 웰헤드의 실사용 수명 보장이 아니다/, /밸브 조작·안전 기능 변경 지침이 아니다/],
  "60": [/자문 경보/, /모든 설비를 본사에서 직접 제어한다는 권한표/, /8\.75%/, /1\.25%포인트/, /12\.5%/, /공통 조작 순서를 제시하지 않는다/],
  "69": [/운영 조정에 3개월/, /1년 동안/, /AGOC의 원유 생산능력은 제외/, /30일 이내 가동하고 최소 90일 유지/, /7,566mbpd/, /9,055mbpd/, /9,463mboed/, /11,030mboed/, /물질 범위를 섞는 계산/, /2026년 10월 12일 현재 가동 상태로 해석할 수 없다/],
};
for (const [id, claims] of Object.entries(controlCapacityReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Control, units and period boundaries: ${id}`);
  assert.doesNotMatch(content, /제가 (?:처음|과거|직접)|안심하셔도 좋습니다|지연 없이 본사|안전을 원천적으로|군사 기지 수준/, `No unsupported experience or guarantee: ${id}`);
}
assert.equal(990 / 1000 * 100, 99, "Wireless receipt denominator");
assert.equal((2 - 1) / 2 * 100, 50, "Transmission time improvement");
assert.equal(8 + 2 + 20 + 10, 40, "Illustrative decision time before");
assert.equal(8 + 1 + 20 + 10, 39, "Illustrative decision time after");
assert.equal(70 / 800 * 100, 8.75, "NPT example share");
assert.equal(10 - 8.75, 1.25, "NPT percentage-point difference");
assert.equal((10 - 8.75) / 10 * 100, 12.5, "NPT relative share change");
assert.equal((100 - 70) / 100 * 100, 30, "NPT hour reduction");
assert.equal(20 + 10, 100 - 70, "Illustrative capacity headroom");
assert.equal(7566 / 1000, 7.566, "Thousands to millions of liquid barrels per day");
assert.equal(11030 / 1000, 11.03, "Thousands to millions of oil-equivalent barrels per day");
const partsFuelModuleReviews = {
  "65": [/연구가 초기 단계/, /시험 1,000시간 통과 = 현장 10년/, /임의 환산하지 않는다/, /100,000 × 10,000 = 1건/, /40,000 × 10,000 = 1\.5건/, /시험 절차·합격 기준을 검토한 보고서가 아니다/, /5년 비용 예시/, /라이선스의 범위와 상태/],
  "61": [/모든 선박에 VLSFO라는 제품 한 종류만 의무화됐다고 설명하지 않는다/, /0\.50% m\/m/, /0\.10% m\/m/, /2025-05-01/, /2026-03-01/, /2027-03-01/, /공통 운전 조건/, /100 × 0\.005 = 0\.5톤/, /CO2 80% 감소로 표시하지 않는다/, /제7판/],
  "59": [/전체 공기 35% 단축·사고율 50% 감소를 계산할 수 없다/, /20,000톤/, /32개월/, /850만 시간/, /4 \+ max\(6, 16\) \+ 2 \+ 4 = 26개월/, /100 → 60 \+ 50 = 110톤/, /회사 실적이 아니다/, /구조 설계·인양·운송·접합 작업 지침은 아니다/],
};
for (const [id, claims] of Object.entries(partsFuelModuleReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Parts, fuel and module evidence boundary: ${id}`);
  assert.doesNotMatch(content, /제가 (?:직접|현장에서|과거)|저 역시|참여했을 때 저는|안전성을 완벽히|먼지 하나 허용하지|무고장 가동 시스템을 구축/, `No unverified fieldwork or universal guarantee: ${id}`);
}
assert.equal(10 / 100000 * 10000, 1, "Parts observed failures per exposure A");
assert.equal(Math.round(6 / 40000 * 10000 * 10) / 10, 1.5, "Parts observed failures per exposure B to displayed precision");
assert.equal(100 * 3 + 40 * 3 + 60 * 3, 600, "Illustrative parts period cost A");
assert.equal(180 * 2 + 40 * 2 + 60 * 2, 560, "Illustrative parts period cost B");
assert.equal(100 * 0.005, 0.5, "Illustrative sulfur inventory A in tonnes");
assert.equal(100 * 0.001, 0.1, "Illustrative sulfur inventory B in tonnes");
assert.equal((0.5 - 0.1) / 0.5 * 100, 80, "Sulfur inventory change, not emissions");
assert.equal(600 / 40, 15, "Illustrative fuel energy cost A");
assert.equal(4 + 6 + 10 + 2 + 4, 26, "Sequential schedule model");
assert.equal(4 + Math.max(6, 10) + 2 + 4, 20, "Parallel schedule model");
assert.equal(4 + Math.max(6, 16) + 2 + 4, 26, "Parallel schedule with delay");
assert.equal(60 + 50, 110, "Whole-project illustrative waste boundary");
const circularVirtualTradingReviews = {
  "58": [/21\.3%포인트/, /현재 배치별 함량/, /80 ÷ 100 = 80%/, /60 ÷ 100 = 60%/, /60 \+ 20 \+ 20 = 100t/, /생산 수율을 변경한 것이 아니다/, /특정 시설이 어떤 방법을 썼는지 임의로 단정하지 않았다/, /공정 운전·폐기물 처리·제품 인증 지침은 아니다/],
  "55": [/2020년 5월 6일/, /Hasbah 가스전/, /94\.7%를 현장의 사고 예방률로 바꿀 수 없다/, /같은 현실 평가를 포함/, /105,000달러/, /공개 초록/, /현장 작업·밸브 조작·직무 자격 승인 지침은 아니다/],
  "53": [/mmbpd는 백만 배럴\/일/, /7\.4mmbpd/, /630만 톤/, /6\.3mmbpd/, /보고 주체는 Aramco/, /세계 시장 점유율·유가 상승률·이익 증가율이 아니다/, /-12,000 \+ 10,000 = -2,000달러/, /ATC 단독 성과로 바꾸지 않았다/],
};
for (const [id, claims] of Object.entries(circularVirtualTradingReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Circular, virtual and trading evidence boundary: ${id}`);
  assert.doesNotMatch(content, /제가 (?:직접|과거|지난)|저 역시|위험이 전혀 없|손실이 발생하지 않|완벽한 자급/, `No unverified experience or universal guarantee: ${id}`);
}
assert.equal(Math.round((69.1 - 47.8) * 10) / 10, 21.3, "Reported waste recycling percentage points, not chemical yield");
assert.equal(60 + 20 + 20, 100, "Simplified illustrative material balance");
assert.equal(80 / 100 * 100, 80, "Illustrative recovery denominator");
assert.equal(60 / 100 * 100, 60, "Illustrative compliant output denominator");
assert.equal(60 / 80 * 100, 75, "Illustrative compliant share of recovered output");
assert.equal(40000 + 10000 - 65000, -15000, "Illustrative lower-sales resource value");
assert.equal(30000 + 20000 + 20000, 70000, "Illustrative classroom annual cost including assessment");
assert.equal(60000 / 3 + 10000 + 15000 + 20000, 65000, "Illustrative VR annual cost including assessment");
assert.equal(60000 + 10000 + 15000 + 20000, 105000, "Illustrative VR cost with one-year content use");
assert.equal(74000 - 70000 - 3500, 500, "Illustrative physical trading remainder A");
assert.equal(73000 - 70000 - 3500, -500, "Illustrative physical trading remainder B");
assert.equal(-12000 + 10000, -2000, "Illustrative imperfect price offset, not a trading strategy");
const droneStorageJazanReviews = {
  "50": [/검사와 대드론 방어/, /17\.5 ÷ 2/, /8\.75배/, /기체의 능력과 조종자의 숙련/, /전체에 실제 결함이 몇 개 있었는지 모르면/, /판독 불가 15개와 촬영하지 못한 10개/, /시설의 비행 경로·방어 구성·기체 조작이나 안전 점검 절차를 제공하는 글은 아니다/],
  "49": [/예상 25년/, /1-MW\/hour/, /정격 출력 1MW로 임의 교정/, /교류 출력 경계에서 0\.8MWh/, /손실을 다시 곱하지 않으며/, /0\.30 \+ 0\.05 = 0\.35MW/, /800 ÷ 1,000 = 80%/, /현재 사우디 장비 견적에 사용하지 않았다/, /배터리 설계·설치·충방전 조작·안전 판정 지침은 아니다/],
  "39": [/400mbpd·Equity ownership 100%/, /3,800MW Gross/, /2026년 10월 15일의 실제 원유 유입량을 확인한 값이 아니다/, /첫 자산군 인수/, /7,200,000 ÷ 25/, /72%/, /100 - 15 - 55 = 30/, /실제 Jazan의 수급 자료가 아님/, /공정 운전·정비·비상 대응이나 작업 허가 지침은 아니다/],
};
for (const [id, claims] of Object.entries(droneStorageJazanReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Drone, storage and Jazan evidence boundary: ${id}`);
  assert.doesNotMatch(content, /제가 (?:직접|과거|지난|현장)|저 역시|제가 만난|현장에서 직접 확인|화재 위험이 없|수명을 보장하는|안심하셔도/, `No invented experience or safety guarantee: ${id}`);
}
assert.equal(70 / 4 / (2 / 1), 8.75, "Reported elapsed-time throughput ratio, not labor or safety");
assert.equal(75 / 100 * 100, 75, "Illustrative usable inspection coverage");
assert.equal(12 / 20 * 100, 60, "Illustrative alarm precision, not missed defect rate");
assert.equal(100 - 90, 10, "Illustrative unrecorded inspection targets");
assert.equal(90 - 75, 15, "Illustrative recorded but unusable targets");
assert.equal(800 / 1000 * 100, 80, "Illustrative round-trip efficiency");
assert.ok(0.3 + 0.05 > 0.25, "Illustrative load exceeds output rating despite stored energy");
assert.equal(800 * 0.2 - 1000 * 0.08, 80, "Illustrative electricity cost difference per cycle");
assert.equal(80 * 300 - 30000, -6000, "Illustrative annual remainder before capital and other costs");
assert.equal(320000 * 20 + 160000 * 5, 7200000, "Illustrative refinery period throughput");
assert.equal(7200000 / 30, 240000, "Illustrative calendar-day average");
assert.equal(7200000 / 25, 288000, "Illustrative operating-day average");
assert.equal(7200000 / (400000 * 25) * 100, 72, "Illustrative operating-day denominator");
assert.equal((100 - 15 - 55) * 24, 720, "Illustrative external electricity energy boundary");
assert.equal(360 + 1320 + 720, 2400, "Illustrative electricity balance");
if (reviewIds.has("18")) {
  const content = await readFile(path.join(root, "data/reviewed/18.html"), "utf8");
  for (const claim of [/원유가 이동하는 과정/, /1조 개 활성 계산 셀/, /현재 세계 최고 순위/, /두 코드가 비슷해도 같은 입력 가정의 한계를 공유/, /POWERS·OPM을 실행해 얻은 결과가 아니다/, /최종 독립 평가 자료가 아니다/, /2\.5라는 단위 있는 오차/, /68\.75%/, /예측 회수량의 상대 차이|최종 회수량의 상대 차이/, /이미 더 생산했다는 실적이 아니다/, /유정 위치·주입량·운전 조건을 결정하는 현장 지침은 아니다/]) {
    assert.match(content, claim, "Reservoir simulation evidence and scope");
  }
  assert.doesNotMatch(content, /제가 (?:직접|과거|지난)|저 역시|성능을 보장합니다|현재 세계 최고입니다/, "No invented experience or universal performance guarantee");
  const reviewedDom = cheerio.load(content);
  const table = reviewedDom('div[aria-label="이력 일치와 미래 평가의 가상 생산률 비교"] table');
  const rows = table.find("tbody tr").toArray().map(row => reviewedDom(row).find("td").toArray().map(cell => Number(reviewedDom(cell).text())));
  assert.deepEqual(rows, [[90, 90, 90], [80, 80, 80], [70, 72, 80], [60, 63, 75]], "Published illustrative holdout data");
  const mae = (samples, column) => samples.reduce((sum, row) => sum + Math.abs(row[column] - row[0]), 0) / samples.length;
  assert.equal(mae(rows.slice(0, 2), 1), 0, "Model A fit MAE");
  assert.equal(mae(rows.slice(0, 2), 2), 0, "Model B fit MAE");
  assert.equal(mae(rows.slice(2), 1), 2.5, "Model A holdout MAE");
  assert.equal(mae(rows.slice(2), 2), 12.5, "Model B holdout MAE");
  assert.equal((512 * 2.5 - 128 * 8) / (128 * 8) * 100, 25, "Illustrative core-hour increase");
  assert.equal(Math.round((18 - 12.5) / 18 * 1000) / 10, 30.6, "Illustrative end-to-end time decrease");
  assert.equal((8 - 2.5) / 8 * 100, 68.75, "Illustrative runtime-only decrease");
  assert.equal(40 - 35, 5, "Illustrative recovery percentage points");
  assert.equal(Math.round(5000000 / 35000000 * 1000) / 10, 14.3, "Illustrative ultimate recovery relative difference");
  assert.equal(35000000 - 10000000, 25000000, "Illustrative A remaining forecast");
  assert.equal(40000000 - 10000000, 30000000, "Illustrative B remaining forecast");
}
const technologyFuelMaterialReviews = {
  "82": [/Wa’ed Ventures의 5억 달러/, /향후 4년/, /순제거량 12톤을 독립 검증한 결과가 아니다/, /현재 DAC 실적으로 표시하지 않는다/, /아람코의 공식 단계·TRL 판정·투자 승인 절차가 아니/],
  "79": [/2026년 3월 10일/, /완전 가동을 2027년/, /2026년 적용 규격의 전체 목록·최신 한도를 검증한 표로 사용하지 않았다/, /D7566/, /D1655/, /79\.66/, /11\.49%/, /실제 연료 배합이나 권장 비율이 아님/],
  "78": [/일부 등급의 제조비를 50% 낮추려는/, /차량 기준은/, /0\.4%/, /원가 저감 목표 하나로 자동차 가격 인하를 보장할 수 없다/, /위 부품 질량에서 도출한 값이 아니라/, /부품 설계·충돌 안전·수리 승인 지침이 아니다/],
};
for (const [id, claims] of Object.entries(technologyFuelMaterialReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Technology, fuel and material evidence boundaries: ${id}`);
  assert.doesNotMatch(content, /제가 (?:직접|과거|지난)|저 역시|20년 경력의 전문가로서|그냥 넣으셔도|완벽하게 안전/, `No invented experience or universal approval: ${id}`);
}
if (reviewIds.has("79")) {
  const content = await readFile(path.join(root, "data/reviewed/79.html"), "utf8");
  assert.match(content, /600 ÷ \(2,880 \+ 600\)/);
  const share = 20 * 30 / (80 * 36 + 20 * 30);
  assert.equal(Math.round(share * 10000) / 100, 17.24);
  const intensity = 90 * (1 - share) + 30 * share;
  assert.equal(Math.round(intensity * 100) / 100, 79.66);
  assert.equal(Math.round((90 - intensity) / 90 * 10000) / 100, 11.49);
  assert.equal(90 * 0.8 + 30 * 0.2, 78);
  const dom = cheerio.load(content);
  const cells = dom('div[aria-label="가상 연료의 부피와 에너지 기여량 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => dom(cell).text()));
  assert.deepEqual(cells.slice(0, 3), [["80L", "20L"], ["36MJ/L", "30MJ/L"], ["2,880MJ", "600MJ"]]);
}
if (reviewIds.has("78")) {
  const content = await readFile(path.join(root, "data/reviewed/78.html"), "utf8");
  assert.match(content, /90,000 ÷ 0\.75 \+ 20,000 = 140,000원/);
  assert.match(content, /300 ÷ 0\.003 = 100,000km/);
  assert.equal((20 - (10 + 2)) / 20 * 100, 40);
  assert.equal(8 / 2000 * 100, 0.4);
  assert.equal(Math.round(80000 / 0.95 + 10000), 94211);
  assert.equal(90000 / 0.75 + 20000, 140000);
  assert.equal(90000 / 0.90 + 20000, 120000);
  assert.equal(300 / 0.003, 100000);
  assert.equal(300 - 60000 * 0.003, 120);
  assert.equal(150000 * 0.003 - 300, 150);
}
const ledgerAquiferForumReviews = {
  "77": [/2020년 1월 28일/, /500만 달러/, /향후 플랫폼 사용자/, /오라클 문제/, /미검수 80건의 정확도를 90%로 확정하지 않는다/, /대조 단계는 약 83\.3% 빨라진 것이 아니라/, /20\.8%/],
  "75": [/모든 유전이 동일한/, /압력 45%·염도 20%·투과율 35%/, /600 ÷ \(900 \+ 600\) = 40%/, /20%포인트/, /12\.5%/, /자연 수층의 유입량이라고 계산하지도 않는다/, /주입량·약품·밸브 설정/],
  "64": [/2026년 10월 5일/, /2025년 1월 13일/, /2026년 5월 6일/, /새 투자 180억 달러/, /모든 조항이 구속력이 없다고 단정할 수도 없다/, /창고 실내 면적·연간 처리량·현재 가동률이 아니다/, /중복 여부 미확인/],
};
for (const [id, claims] of Object.entries(ledgerAquiferForumReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Ledger, aquifer and forum evidence boundaries: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|지난)|저 역시|전문가로서 보기에|실무에서 경험한 바/, `No invented experience: ${id}`);
}
if (reviewIds.has("77")) {
  const content = await readFile(path.join(root, "data/reviewed/77.html"), "utf8");
  const dom = cheerio.load(content);
  const counts = dom('div[aria-label="가상 원장 기록과 원자료 검수의 범위 비교"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text()));
  assert.deepEqual(counts, [100, 18, 2, 80]);
  assert.equal(counts[1] + counts[2] + counts[3], counts[0]);
  assert.equal((counts[1] + counts[2]) / counts[0] * 100, 20);
  assert.equal(counts[1] / (counts[1] + counts[2]) * 100, 90);
  assert.equal(6 + 3 + 15, 24);
  assert.equal(1 + 3 + 15, 19);
  assert.equal(Math.round((24 - 19) / 24 * 1000) / 10, 20.8);
}
if (reviewIds.has("75")) {
  const content = await readFile(path.join(root, "data/reviewed/75.html"), "utf8");
  const dom = cheerio.load(content);
  const rows = dom('div[aria-label="가상 원유와 생산수 및 물 비율 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/[,%]/g, ""))));
  assert.deepEqual(rows, [[800, 200, 1000, 20], [900, 600, 1500, 40], [400, 600, 1000, 60]]);
  for (const [oil, water, total, cut] of rows) {
    assert.equal(oil + water, total);
    assert.equal(water / total * 100, cut);
  }
  assert.equal((900 - 800) / 800 * 100, 12.5);
  assert.equal(600 * 1 - 200 * 1, 400);
}
if (reviewIds.has("64")) {
  const content = await readFile(path.join(root, "data/reviewed/64.html"), "utf8");
  const dom = cheerio.load(content);
  const rows = dom('div[aria-label="가상 포럼 발표의 사업별 중복 제거 기록"] tbody tr').toArray().map(row => dom(row).find("td").toArray().slice(0, 2).map(cell => dom(cell).text()));
  assert.deepEqual(rows, [["1,000", "해당 없음"], ["600", "250"], ["400", "100"]]);
  const current = rows.slice(1).reduce((sum, row) => sum + Number(row[0]), 0);
  const paid = rows.slice(1).reduce((sum, row) => sum + Number(row[1]), 0);
  assert.equal(current, 1000);
  assert.equal(paid, 350);
  assert.match(content, /600 \+ 400 = 1,000만 달러/);
  assert.match(content, /250 \+ 100 = 350만 달러/);
}
console.log(JSON.stringify({ articles: posts.length, reviewed: report, unchangedLegacyArticles: legacy.length, legacyHash }, null, 2));
