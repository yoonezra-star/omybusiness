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
  "energy.gov.au", "noaa.gov", "tethys-robotics.ch",
  "gevernova.com", "otexts.com",
  "bahri.sa", "imf.org",
  "aramcolife.com", "hyundai.com",
  "chemistrythatmatters.org", "arodrilling.com", "bsee.gov",
  "nghc.com",
  "midoceanenergy.com", "next-decade.com", "fao.org",
  "europa.eu",
  "wipo.int",
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
const heatSolarSubseaReviews = {
  "63": [/2022년 1월 6일/, /시설별로 열병합 구성을 맞춘다/, /0\.9 - 0\.15 = 0\.75MWe/, /6\.75MW의 추가 전력이라고 쓰지 않는다/, /발전 가능량.*실측 생산량으로 읽으면 안 된다/, /금융비·세금·열화/],
  "57": [/2021년 8월 15일/, /2024년 8월 4일/, /계약상 전력 권리/, /1,752 ÷ \(1 × 8,760\) = 20%/, /같은 AC 계량 경계/, /구간 1의 부족을 뒤에 충전한 에너지로 소급해 채울 수는 없다/, /0\.2MWh/, /전 과정 배출/],
  "54": [/2017년 12월 27일/, /2025년 10월 16일/, /다음 단계가 사우디 실제 시설 시험/, /최대 300m/, /호수에서 300m를 시험했다는 측정 기록/, /별도 독립 시험 증거로 세지 않았다/, /7\.5%포인트/, /실제 비행·잠항·진수·회수·잠수사 작업의 실행 지침은 제공하지 않는다/],
};
for (const [id, claims] of Object.entries(heatSolarSubseaReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Heat, solar and subsea evidence boundaries: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|지난)|저 역시|엔지니어는.*라고 말하며|단 1초의 멈춤도 허용하지/, `No invented experience or guarantee: ${id}`);
}
if (reviewIds.has("63")) {
  const content = await readFile(path.join(root, "data/reviewed/63.html"), "utf8");
  assert.match(content, /0\.75 × 6,000 × 0\.8 = 3,600MWh/);
  assert.equal(6 / 10 * 100, 60);
  assert.equal(0.9 - 0.15, 0.75);
  assert.equal(0.75 / 6 * 100, 12.5);
  assert.equal(0.75 * 6000 * 0.8, 3600);
  assert.equal(2400000 / (3600 * 100 - 60000), 8);
  assert.equal(Math.round(2400000 / (2400 * 100 - 60000) * 10) / 10, 13.3);
}
if (reviewIds.has("57")) {
  const content = await readFile(path.join(root, "data/reviewed/57.html"), "utf8");
  const dom = cheerio.load(content);
  const rows = dom('div[aria-label="가상 태양광 발전과 시간대별 부하 일치 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().slice(0, 3).map(cell => Number(dom(cell).text())));
  assert.deepEqual(rows, [[0.5, 1, 0.5], [2, 1, 1], [0.5, 1, 0.5], [0, 1, 0]]);
  const solar = rows.reduce((sum, row) => sum + row[0], 0);
  const demand = rows.reduce((sum, row) => sum + row[1], 0);
  const direct = rows.reduce((sum, row) => sum + Math.min(row[0], row[1]), 0);
  const surplus = rows.reduce((sum, row) => sum + Math.max(0, row[0] - row[1]), 0);
  assert.equal(solar, 3);
  assert.equal(demand, 4);
  assert.equal(direct / demand * 100, 50);
  assert.equal(solar / demand * 100, 75);
  assert.equal((direct + surplus * 0.8) / demand * 100, 70);
  assert.equal(Math.round((demand - direct - surplus * 0.8) * 10) / 10, 1.2);
  assert.equal(1752 / (1 * 8760) * 100, 20);
}
if (reviewIds.has("54")) {
  const content = await readFile(path.join(root, "data/reviewed/54.html"), "utf8");
  const dom = cheerio.load(content);
  const distances = dom('div[aria-label="가상 해저 검사 거리와 자료 품질의 범위 비교"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text().replace("km", "")));
  assert.deepEqual(distances, [3.2, 2.8, 2.1, 0.7, 1.2]);
  assert.equal(Math.round((3.2 - 0.4 - 0.7) / 4 * 1000) / 10, 52.5);
  assert.equal(12000 + 6 * 2000 + 8 * 100, 24800);
  assert.equal(3 * 2000 + 2 * 100, 6200);
  assert.equal(24800 + 6200, 31000);
  assert.equal(Math.round(24800 / 2.1), 11810);
  assert.equal(Math.round(31000 / 2.4), 12917);
  assert.equal(60 - 52.5, 7.5);
}
const turbineStationDemandReviews = {
  "52": [/2024년 7월 1일/, /Jafurah 열병합/, /현재 상태를 확정하지 않는다는/, /45\.45%/, /1\.96%/, /열의 경제적 가치가 같다는 뜻이 아니다/, /운전·세정·수소 혼합·개조 승인 절차가 아니다/],
  "48": [/2021년 10월 25일/, /2025년 말 사우디 네트워크 185개/, /2019년 6월 18일/, /초기 Toyota Mirai 6대/, /폐점 수를 산출할 수도 없다/, /배터리에 저장되는 쪽의 평균/, /개별 운전자의 대기시간을 몇 분으로 예측한 결과가 아니다/],
  "46": [/입력 변수별 가중치·훈련 표본·독립 평가 오차/, /예측 - 관측/, /관측 - 예측과 부호는 반대/, /정확도 90%라고 표시하지 않는다/, /기간 사이 재고 이월·재주문·이탈은 없고/, /아람코 공식 내부 시나리오/, /포트폴리오 비중이나 매매 시점을 권하지 않는다/],
};
for (const [id, claims] of Object.entries(turbineStationDemandReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Turbine, station and demand evidence boundaries: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|지난)|저 역시|제어실을 방문했을 때|제가 참석했던|오차가 전혀 없/, `No invented experience or perfect prediction: ${id}`);
}
if (reviewIds.has("52")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/52.html"), "utf8"));
  const percentages = dom('div[aria-label="가상 발전소 총출력 순출력 열병합 비교"] tbody tr').toArray().map(row => dom(row).find("td").eq(1).text());
  assert.deepEqual(percentages, ["54%", "50%", "75%"]);
  assert.equal(108 / 200 * 100, 54);
  assert.equal((108 - 8) / 200 * 100, 50);
  assert.equal((108 - 8 + 50) / 200 * 100, 75);
  const efficiencies = dom('div[aria-label="가상 동일 순출력에서 효율과 연료 투입 비교"] tbody tr').first().find("td").toArray().map(cell => Number(dom(cell).text().replace("%", "")) / 100);
  assert.deepEqual(efficiencies, [0.5, 0.51]);
  assert.equal(Math.round((1 - efficiencies[0] / efficiencies[1]) * 10000) / 100, 1.96);
  assert.equal(Math.round(3600 / efficiencies[1] * 100) / 100, 7058.82);
  assert.equal(Math.round(100 / 220 * 10000) / 100, 45.45);
}
if (reviewIds.has("48")) {
  const content = await readFile(path.join(root, "data/reviewed/48.html"), "utf8");
  const dom = cheerio.load(content);
  const times = dom('div[aria-label="가상 전기차 충전 에너지와 체류시간 비교"] tbody tr').toArray().map(row => Number(dom(row).find("td").last().text().replace("분", "")));
  assert.deepEqual(times, [14.4, 24, 30]);
  const energy = Math.round(60 * (0.8 - 0.2));
  assert.equal(energy, 36);
  assert.equal(Math.round(energy / 150 * 600) / 10, times[0]);
  assert.equal(energy / 90 * 60, times[1]);
  assert.equal(times[1] + 6, times[2]);
  assert.equal(2 * 60 / times[2], 4);
  assert.equal(1 * 60 / times[2], 2);
}
if (reviewIds.has("46")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/46.html"), "utf8"));
  const rows = dom('div[aria-label="가상 수요 관측과 두 예측의 기간별 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().slice(0, 3).map(cell => Number(dom(cell).text())));
  assert.deepEqual(rows, [[100, 110, 90], [120, 110, 110], [80, 90, 70], [100, 90, 90]]);
  for (const column of [1, 2]) {
    const errors = rows.map(row => row[column] - row[0]);
    assert.equal(errors.reduce((sum, error) => sum + Math.abs(error), 0) / rows.length, 10);
    assert.equal(errors.reduce((sum, error) => sum + error, 0) / rows.length, column === 1 ? 0 : -10);
    const shortage = errors.reduce((sum, error) => sum + Math.max(0, -error), 0);
    const surplus = errors.reduce((sum, error) => sum + Math.max(0, error), 0);
    assert.equal(shortage, column === 1 ? 20 : 40);
    assert.equal(surplus, column === 1 ? 20 : 0);
    assert.equal(shortage * 3 + surplus, column === 1 ? 80 : 120);
  }
}
const shippingGasCostReviews = {
  "45": [/2024년 1월 18일/, /Stena Provident·Stena Progressive/, /2025년 9월 11일/, /그 전량을 처리하는 장치/, /남은 79\.2톤/, /59\.3%/, /CII·EEXI 공식 등급 산정이 아니다/],
  "44": [/2024년 6월 30일/, /31억 5,000만 표준입방피트/, /새 트레인 17개/, /가스 처리 능력/, /처리 전 원료 부피가 아니라/, /관로 증가율과 판매 증가율은 자동으로 같아지지 않는다/, /실제 MGS 계통도·압력 계산·밸브 또는 압축기 조작 절차가 아니다/],
  "43": [/생산 석유환산배럴당 3\.51달러/, /석유환산배럴당 8\.0달러/, /3\.51 \+ 8\.0 = 11\.51/, /16\.7% 상승/, /10억은 실제 생산량이나 아람코 배당액이 아니라/, /전체 문서 검토로 표시하지 않았다/],
};
for (const [id, claims] of Object.entries(shippingGasCostReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Shipping, gas and cost evidence boundaries: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|지난)|저 또한|제가 현장에서|세계에서 가장 안전한|최후의 승자가 될 수밖에/, `No invented experience or universal guarantee: ${id}`);
}
if (reviewIds.has("45")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/45.html"), "utf8"));
  const amounts = dom('div[aria-label="가상 선박 포집량과 순배출의 계산"] tbody tr').toArray().map(row => Number(dom(row).find("td").last().text().replace("tCO₂e", "")));
  assert.deepEqual(amounts, [110, -88, 8.8, 14, 44.8]);
  assert.ok(Math.abs(amounts.slice(0, 4).reduce((sum, n) => sum + n, 0) - amounts[4]) < 1e-9);
  assert.equal(Math.round((110 - amounts[4]) / 110 * 1000) / 10, 59.3);
  assert.equal(110 * 0.8, 88);
  assert.equal(Math.round(88 * 0.9 * 10) / 10, 79.2);
  const voyages = dom('div[aria-label="가상 항차 총배출과 실제 화물 운송량당 배출 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/[,톤]/g, ""))));
  assert.deepEqual(voyages, [[1000, 100000, 1000, 10], [900, 60000, 1000, 15]]);
  for (const [co2, cargo, distance, intensity] of voyages) assert.equal(co2 * 1e6 / (cargo * distance), intensity);
  assert.equal((15 - 10) / 10 * 100, 50);
}
if (reviewIds.has("44")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/44.html"), "utf8"));
  const rows = dom('div[aria-label="가상 가스 공급망의 구간별 상한과 병목 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(rows, [[8, 8, 8], [7, 7, 7], [6, 9, 9], [5, 5, 7], [5, 5, 7]]);
  for (let i = 0; i < 3; i++) assert.equal(Math.min(...rows.slice(0, 4).map(row => row[i])), rows[4][i]);
  assert.equal((rows[2][1] - rows[2][0]) / rows[2][0] * 100, 50);
  assert.equal((rows[4][2] - rows[4][0]) / rows[4][0] * 100, 40);
  assert.equal(135 / 30, 4.5);
  assert.equal(135 / (6 * 30) * 100, 75);
  assert.equal(135 / (6 * 25) * 100, 90);
}
if (reviewIds.has("43")) {
  const content = await readFile(path.join(root, "data/reviewed/43.html"), "utf8");
  const dom = cheerio.load(content);
  const reported = dom('div[aria-label="아람코 2025년 평균 상류 비용과 자본지출의 공식 수치"] tbody tr').toArray().map(row => dom(row).find("td").toArray().slice(0, 2).map(cell => Number(dom(cell).text())));
  assert.deepEqual(reported, [[3.51, 3.53], [8, 8.3]]);
  const rows = dom('div[aria-label="가상 생산량 변화에 따른 총운영비와 평균 단가 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(rows, [[100, 80], [200, 200], [100, 80], [300, 280], [3, 3.5]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(rows[1][i] + rows[2][i], rows[3][i]);
    assert.equal(rows[3][i] / rows[0][i], rows[4][i]);
  }
  assert.equal(Math.round((3.5 - 3) / 3 * 1000) / 10, 16.7);
  assert.equal((1200 - 400) / 10, 80);
  assert.match(content, /800억 ÷ 10억 = 80달러\/배럴/);
}
const desalEngineConversionReviews = {
  "42": [/2021년 1월 27일/, /2020년 9월/, /나노여과 트레인/, /35,000kg/, /58\.2kg/, /4\.21kWh/, /특정 농축수를 바다에 방류해도 안전하다는 판정에 사용할 수 없다/],
  "41": [/2022년 3월 30일/, /초희박 불꽃점화 엔진용 연료/, /가솔린 엔진/, /2024년 양산 완료의 증거가 아니다/, /저위발열량\(LHV\) 기준/, /25\.2kWh/, /63\.49kWh/, /차량·탱크·생산설비 제조/],
  "40": [/2022년 11월 17일/, /2027년 1월 목표 상업 가동/, /원유 20 \+ 중질유 26MBD/, /독립 검증한 것은 아니다/, /60 \+ 57 = 117톤/, /수율은 이익률이 아니다/, /영업이익·순이익이 아니며/],
};
for (const [id, claims] of Object.entries(desalEngineConversionReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Desalination, engine and conversion boundaries: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|지난)|제가 업계|저도 처음|저 역시|제가 전문가/, `No invented experience: ${id}`);
}
if (reviewIds.has("42")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/42.html"), "utf8"));
  const rows = dom('div[aria-label="가상 담수화 회수율과 농축수의 부피 및 염 수지 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/[,%]/g, ""))));
  assert.deepEqual(rows, [[400, 500], [40, 50], [600, 500], [80, 100], [34920, 34900], [58.2, 69.8]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(rows[0][i] + rows[2][i], 1000);
    assert.equal(rows[3][i] + rows[4][i], 35000);
    assert.equal(rows[4][i] / rows[2][i], rows[5][i]);
  }
  const power = dom('div[aria-label="가상 담수화 설비의 전력과 최종 인도수 기준 비교"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text().replace(/,/g, "")));
  assert.deepEqual(power, [200, 1200, 100, 100, 1600]);
  assert.equal(power.slice(0, 4).reduce((sum, n) => sum + n, 0), power[4]);
  assert.equal(Math.round(power[4] / 380 * 100) / 100, 4.21);
  assert.equal(Math.round((69.8 - 58.2) / 58.2 * 1000) / 10, 19.9);
}
if (reviewIds.has("41")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/41.html"), "utf8"));
  const energy = dom('div[aria-label="가상 수소 에너지 경로의 단계별 잔량 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace("kWh", ""))));
  assert.deepEqual(energy, [[70, 63, 25.2], [70, 63, 31.5]]);
  const emissions = dom('div[aria-label="가상 수소 경로의 전력 배출계수에 따른 배출 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace("약 ", ""))));
  assert.deepEqual(emissions, [[79.37, 7.94, 47.62], [63.49, 6.35, 38.10]]);
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(100 * 0.7 * 0.9 * [0.4, 0.5][i] - energy[i][2]) < 1e-9);
    const input = 20 / energy[i][2] * 100;
    assert.equal(Math.round(input * 100) / 100, emissions[i][0]);
    for (const [j, factor] of [[1, 0.1], [2, 0.6]]) assert.equal(Math.round(input * factor * 100) / 100, emissions[i][j]);
  }
}
if (reviewIds.has("40")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/40.html"), "utf8"));
  const accounting = dom('div[aria-label="가상 화학전환 중간제품과 최종제품의 중복 집계 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/모노머 |폴리머 /g, ""))));
  assert.deepEqual(accounting, [[60, 57], [25, 25], [15, 18], [100, 100]]);
  for (let i = 0; i < 2; i++) assert.equal(accounting.slice(0, 3).reduce((sum, row) => sum + row[i], 0), accounting[3][i]);
  const money = dom('div[aria-label="가상 화학 수율과 변동가공비 및 판매 차액 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,/g, ""))));
  assert.deepEqual(money, [[60, 70], [40, 30], [78000, 81000], [60000, 60000], [12000, 18000], [6000, 3000]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(money[0][i] * 900 + money[1][i] * 600, money[2][i]);
    assert.equal(money[2][i] - money[3][i] - money[4][i], money[5][i]);
  }
}
const centerSynergyDrillingReviews = {
  "38": [/2022년 10월 23일/, /2019년 설립/, /AI Hub가 24시간 운영 통제센터는 아니/, /2010년 이후/, /다른 플레어 최소화 활동/, /총사용량은.*8% 증가/, /물리적 정확성이 보장됐다는 뜻은 아니다/],
  "37": [/2020년 6월 17일/, /691억 달러/, /누적 시너지 편익을 32\.7억 달러/, /2030년 반복 연간 EBITDA 효과 목표 30억 달러/, /인수대금·투자지출·운전자본·이자·세금/, /같은 금액이 새로 생긴 것은 아니다/, /열람 리디렉션 문제/],
  "36": [/2025년 9월 16일/, /6개월 시험/, /최종 성적과 완료 공지가 없어/, /원격이라고 자율인 것은 아니/, /≈ 3\.3%/, /-8,333달러/, /사고 확률이 66\.7% 낮아졌다는 뜻은 아니다/, /미국 관할 설명을 사우디 적용 법규/],
};
for (const [id, claims] of Object.entries(centerSynergyDrillingReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Center, synergy and drilling evidence boundaries: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|관찰)|저는 과거|제가 아는 한 지인|저 역시|완벽한 무인|사고를 원천 차단/, `No fabricated experience or safety guarantee: ${id}`);
}
if (reviewIds.has("38")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/38.html"), "utf8"));
  const energy = dom('div[aria-label="가상 생산량과 에너지 총량 및 원단위 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,/g, ""))));
  assert.deepEqual(energy, [[100, 120], [1000, 1080], [10, 9], [1000, 1200]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(energy[1][i] / energy[0][i], energy[2][i]);
    assert.equal(energy[0][i] * energy[2][0], energy[3][i]);
  }
  assert.equal((1080 - 1000) / 1000 * 100, 8);
  assert.equal((10 - 9) / 10 * 100, 10);
  assert.equal(1200 - 1080, 120);
  const data = dom('div[aria-label="가상 데이터 수집량과 고유 유효 관측의 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,/g, ""))));
  assert.deepEqual(data, [[2400, 2160], [480, 0], [1920, 2160], [80, 90]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(data[0][i] - data[1][i], data[2][i]);
    assert.equal(data[2][i] / (100 * 24) * 100, data[3][i]);
  }
}
if (reviewIds.has("37")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/37.html"), "utf8"));
  const cash = dom('div[aria-label="가상 통합 프로그램의 연간 편익과 지출 및 누적 현금 효과"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(cash, [[20, 30, 40], [5, 6, 8], [25, 5, 0], [-10, 19, 32], [-10, 9, 41]]);
  let cumulative = 0;
  for (let i = 0; i < 3; i++) {
    assert.equal(cash[0][i] - cash[1][i] - cash[2][i], cash[3][i]);
    cumulative += cash[3][i];
    assert.equal(cumulative, cash[4][i]);
  }
  assert.equal(cash[0].reduce((s, n) => s + n, 0), 90);
  assert.equal([...cash[1], ...cash[2]].reduce((s, n) => s + n, 0), 49);
  const margin = dom('div[aria-label="가상 화학제품 판매 가격과 원료비 하락의 차액 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,/g, ""))));
  assert.deepEqual(margin, [[1000, 850], [600, 500], [250, 250], [150, 100]]);
  for (let i = 0; i < 2; i++) assert.equal(margin[0][i] - margin[1][i] - margin[2][i], margin[3][i]);
  assert.equal(Math.round((150 - 100) / 150 * 1000) / 10, 33.3);
}
if (reviewIds.has("36")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/36.html"), "utf8"));
  const times = dom('div[aria-label="가상 연결 작업과 전체 시추 시간의 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(times, [[100, 100], [6, 4], [10, 6.667], [90, 90], [100, 96.667]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(Math.round(times[0][i] * times[1][i] / 60 * 1000) / 1000, times[2][i]);
    assert.equal(times[2][i] + times[3][i], times[4][i]);
  }
  assert.equal(Math.round((6 - 4) / 6 * 1000) / 10, 33.3);
  assert.equal(Math.round((100 - 96.667) / 100 * 1000) / 10, 3.3);
  assert.equal(Math.round(200 / 60 * 5000 - 25000), -8333);
  const exposure = dom('div[aria-label="가상 연결 작업의 작업구역 인원과 체류 시간 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,/g, ""))));
  assert.deepEqual(exposure, [[100, 100], [2, 1], [6, 4], [1200, 400]]);
  for (let i = 0; i < 2; i++) assert.equal(exposure[0][i] * exposure[1][i] * exposure[2][i], exposure[3][i]);
  assert.equal(Math.round((1200 - 400) / 1200 * 1000) / 10, 66.7);
}
const hydrogenShaheenTrainingReviews = {
  "35": [/2022년 8월 4일/, /37,800톤/, /8,075톤/, /하루 6톤 능력을 목표로 한 엔지니어링 설계 단계/, /ACWA Power·Air Products·NEOM/, /40\.8%/, /대기 누출이 아니라/, /실제 LCA 또는 인증 심사를 수행한 글이 아니다/],
  "34": [/2026년 6월 25일/, /9조 2,580억 원/, /2027년 1월/, /2026년 10월 현재 상업 생산·판매가 확정됐다는 기록으로 쓰지 않는다/, /규격 미달 총량/, /후자를 공식 설비 이용률이라고 부르지 않는다/, /일별 출근 최대 120명도 교대가 있다면/],
  "32": [/UPDC/, /100만 건 초과/, /2025년 708명/, /320 ÷ 90 ≈ 3\.56시간/, /48 ÷ 100 = 48%/, /평가에 참여하지 않은 40명을 전부 실패 또는 성공으로 가정하지 않는다/, /실제 교육생의 개인정보나 시험 기록을 수집하지 않았다/],
};
for (const [id, claims] of Object.entries(hydrogenShaheenTrainingReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Hydrogen, Shaheen and training boundaries: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|아는)|저는 과거|저 역시|전 직원의 역량을 보장|영구 고용을 보장/, `No invented experience or guaranteed results: ${id}`);
}
if (reviewIds.has("35")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/35.html"), "utf8"));
  const rows = dom('div[aria-label="가상 수소 생산의 선택 흐름 포집과 전체 배출 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(rows, [[6, 0.6], [4, 4], [2, 2], [0, 0.5], [12, 7.1]]);
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(rows.slice(0, 4).reduce((s, row) => s + row[i], 0) - rows[4][i]) < 1e-9);
  assert.ok(Math.abs(rows[0][0] * 0.1 - rows[0][1]) < 1e-9);
  assert.equal(5.4 / 10 * 100, 54);
  assert.equal(Math.round((12 - 7.1) / 12 * 1000) / 10, 40.8);
  const delivery = dom('div[aria-label="가상 공장 출구와 고객 인도 수소의 배출 원단위 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,|약 /g, ""))));
  assert.deepEqual(delivery, [[1000, 900], [3000, 4200], [3, 4.67]]);
  assert.equal(delivery[1][1] - delivery[1][0], 1200);
  for (let i = 0; i < 2; i++) assert.equal(Math.round(delivery[1][i] / delivery[0][i] * 100) / 100, delivery[2][i]);
}
if (reviewIds.has("34")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/34.html"), "utf8"));
  const rows = dom('div[aria-label="가상 초기 가동의 생산 규격 제품 판매 및 재고 흐름"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(rows, [[0, 0, 0, 0], [50, 40, 30, 10], [80, 72, 60, 22], [100, 95, 100, 17], [230, 207, 190, 17]]);
  let stock = 0;
  for (const row of rows.slice(0, 4)) {
    assert.ok(row[0] >= row[1]);
    stock += row[1] - row[2];
    assert.equal(stock, row[3]);
  }
  for (let i = 0; i < 3; i++) assert.equal(rows.slice(0, 4).reduce((s, row) => s + row[i], 0), rows[4][i]);
  assert.equal(stock, rows[4][3]);
  assert.equal(rows[4][0] - rows[4][1], 23);
  assert.equal(Math.round(rows[4][0] / 400 * 1000) / 10, 57.5);
  assert.equal(Math.round(rows[4][2] / 400 * 1000) / 10, 47.5);
  const people = dom('div[aria-label="가상 건설 인력의 일별 인원과 중복 제거 집계"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text()));
  assert.deepEqual(people, [100, 120, 80, 220, 140, 120]);
  assert.equal(people[0] + people[1], people[3]);
  assert.equal(people[0] + people[1] - people[2], people[4]);
  assert.equal(Math.max(...people.slice(0, 2)), people[5]);
}
if (reviewIds.has("32")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/32.html"), "utf8"));
  const reported = dom('div[aria-label="아람코 2025년 교육 지표의 단위와 비교 범위"] tbody tr').toArray().slice(0, 2).map(row => dom(row).find("td").toArray().slice(0, 2).map(cell => Number(dom(cell).text())));
  assert.deepEqual(reported, [[13.8, 16.6], [140, 167]]);
  const courses = dom('div[aria-label="가상 두 교육 과정의 수료 건수와 학습 시간"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => dom(cell).text()));
  assert.deepEqual(courses, [["60", "2", "120"], ["50", "4", "200"], ["110", "해당 없음", "320"]]);
  for (const row of courses.slice(0, 2)) assert.equal(Number(row[0]) * Number(row[1]), Number(row[2]));
  assert.equal(60 + 50 - 20, 90);
  assert.equal(90 / 200 * 100, 45);
  assert.equal(Math.round(320 / 90 * 100) / 100, 3.56);
  assert.equal(Math.round(320 / 110 * 100) / 100, 2.91);
  const evaluation = dom('div[aria-label="가상 교육 과정의 수료와 후속 평가 및 통과 집계"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text()));
  assert.deepEqual(evaluation, [100, 80, 60, 36, 48]);
  assert.equal(evaluation[1] / evaluation[0] * 100, 80);
  assert.equal(evaluation[2] / evaluation[1] * 100, 75);
  assert.equal(evaluation[4] / evaluation[2] * 100, 80);
  assert.equal(evaluation[4] / evaluation[0] * 100, 48);
  assert.equal((evaluation[4] - evaluation[3]) / evaluation[2] * 100, 20);
}
const electrolysisLngBiodiversityReviews = {
  "31": [/HydoTech/, /2023년 5월 22일/, /2022년 상태와 2026년 목표/, /33\.3 ÷ 50 = 66\.6%/, /33\.3 ÷ 60 = 55\.5%/, /39\.4 ÷ 60 ≈ 65\.7%/, /외부 열 공급은 없다고/, /공식 LCOH나 공급 가격이 아니다/],
  "30": [/2024년 10월 24일/, /Hunt가 운영자로 남는다고/, /49% × 35% = 17\.15%/, /2025년 8월 1일/, /2030년 하반기/, /명목 계약량의 단순 곱/, /270만 톤/, /모두 대기 중 메탄 누출이라고 가정하지 않았으며/],
  "29": [/4,900만 그루 넘게/, /64km²/, /2025년 4월 25일/, /14,000그루·5ha·생존율 95%/, /최초 집단은 720 ÷ 1,000 = 72%/, /같은 개체를 계속 추적/, /이 3조차 복원이 원인이라고 확정한 값이 아니다/, /당해 감축 실적으로 잡지 않는다/],
};
for (const [id, claims] of Object.entries(electrolysisLngBiodiversityReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Electrolysis, LNG and biodiversity evidence boundaries: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|아는)|저는 과거|저 역시|완벽한 생태 복원|확정된 투자 수익/, `No fabricated experience or guaranteed outcome: ${id}`);
}
if (reviewIds.has("31")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/31.html"), "utf8"));
  const targets = dom('div[aria-label="DOE PEM 수전해의 상태와 목표 및 스택 시스템 전력 구분"] tbody tr').toArray().map(row => dom(row).find("td").toArray().slice(0, 2).map(cell => Number(dom(cell).text())));
  assert.deepEqual(targets, [[51, 48], [55, 51]]);
  const energy = dom('div[aria-label="가상 수전해 스택과 정류 보조설비 및 인도 압축의 전력 수지"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text()));
  assert.deepEqual(energy, [50, 2, 3, 5, 60]);
  assert.equal(energy.slice(0, 4).reduce((s, n) => s + n, 0), energy[4]);
  assert.equal(Math.round(33.3 / energy[0] * 1000) / 10, 66.6);
  assert.equal(Math.round(33.3 / energy[4] * 1000) / 10, 55.5);
  assert.equal(Math.round(39.4 / energy[4] * 1000) / 10, 65.7);
  const annual = dom('div[aria-label="가상 전해조의 연간 가용 전력과 생산량 및 부분 비용 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,|약 /g, ""))));
  assert.deepEqual(annual, [[8000000, 16000000], [133333, 266667], [7.5, 3.75], [1.8, 1.8], [9.3, 5.55]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(4000 * [2000, 4000][i], annual[0][i]);
    assert.equal(Math.round(annual[0][i] / 60), annual[1][i]);
    assert.equal(Math.round(1000000 / (annual[0][i] / 60) * 100) / 100, annual[2][i]);
    assert.ok(Math.abs(60 * 0.03 - annual[3][i]) < 1e-9);
    assert.ok(Math.abs(annual[2][i] + annual[3][i] - annual[4][i]) < 1e-9);
  }
}
if (reviewIds.has("30")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/30.html"), "utf8"));
  const equity = dom('div[aria-label="가상 LNG 간접 지분 환산과 별도 구매 물량 비교"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text().replace(/,/g, "")));
  assert.deepEqual(equity, [40, 25, 10, 1200, 120, 150]);
  assert.equal(equity[0] / 100 * equity[1], equity[2]);
  assert.equal(equity[3] * equity[2] / 100, equity[4]);
  assert.ok(Math.abs(0.49 * 0.35 * 100 - 17.15) < 1e-9);
  assert.equal(1.2 * 20, 24);
  const money = dom('div[aria-label="가상 LNG 선적과 고객 인도의 에너지 및 부분 비용 계산"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text().replace(/,/g, "")));
  assert.deepEqual(money, [1000000, 990000, 8000000, 1500000, 500000, 10000000]);
  assert.equal(money[0] * 0.99, money[1]);
  assert.equal(money[0] * 8, money[2]);
  assert.equal(money.slice(2, 5).reduce((s, n) => s + n, 0), money[5]);
  assert.equal(Math.round(money[5] / money[1] * 100) / 100, 10.10);
  assert.equal(money[1] * 10 - money[5], -100000);
}
if (reviewIds.has("29")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/29.html"), "utf8"));
  const cohorts = dom('div[aria-label="가상 최초 식재와 보식 집단의 추적 기간별 생존 수 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => dom(cell).text()));
  assert.deepEqual(cohorts, [["1,000", "720", "24"], ["200", "180", "6"], ["1,200", "900", "같은 기간 아님"]]);
  assert.equal(1000 + 200, 1200);
  assert.equal(720 + 180, 900);
  assert.equal(720 / 1000 * 100, 72);
  assert.equal(180 / 200 * 100, 90);
  assert.equal(900 / 1200 * 100, 75);
  const observed = dom('div[aria-label="가상 복원 구역과 비교 구역의 전후 관찰 종 수"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(observed, [[20, 30, 10], [15, 22, 7]]);
  for (const row of observed) assert.equal(row[1] - row[0], row[2]);
  assert.equal(observed[0][2] - observed[1][2], 3);
  assert.equal((30 - 20) / 20 * 100, 50);
}
const polymerPyrolysisFactoryReviews = {
  "28": [/2015년 Khurais/, /시작·종료 연도/, /공개 초록으로 규격의 대상만/, /600 × 4 = 2,400/, /2,600 \+ 2,600 \+ 300 = 5,500/, /ISO 준수 LCA를 수행한 것이 아니다/, /교체 공백 없이 같은 기능/],
  "27": [/2023년 7월 17일/, /SATORP·Ju'aymah/, /480 ÷ 800 = 60%/, /400 ÷ 1,000 = 40%/, /200 \+ 200 \+ 120 \+ 400 \+ 80 = 1,000kg/, /앞의 열분해 공정과 이어지지 않는/, /물리적으로 측정한 재생 분자 비율로 바꾸거나/, /공정 연료로 썼다면/],
  "26": [/2023년 1월 22일/, /VVUQ/, /0\.90 × 0\.85 × 0\.90 = 68\.85%/, /≈ 0\.66%/, /108 ÷ 168 ≈ 64\.3%/, /95 ÷ 168 ≈ 56\.5%/, /인과 증거는 없으며/, /가동시간 감소 자체를 실패로 단정하지 않는다/],
};
for (const [id, claims] of Object.entries(polymerPyrolysisFactoryReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Polymer, pyrolysis and factory evidence boundary: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|아는)|저는 과거|저 역시|현장에서 직접 확인한/, `No invented personal experience: ${id}`);
}
if (reviewIds.has("28")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/28.html"), "utf8"));
  const inventory = dom('div[aria-label="가상 동등 기능 배관의 질량과 초기 배출 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,/g, ""))));
  assert.deepEqual(inventory, [[1000, 600], [2, 4], [2000, 2400], [500, 200], [2500, 2600]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(inventory[0][i] * inventory[1][i], inventory[2][i]);
    assert.equal(inventory[2][i] + inventory[3][i], inventory[4][i]);
  }
  assert.equal((inventory[0][0] - inventory[0][1]) / inventory[0][0] * 100, 40);
  const service = dom('div[aria-label="가상 배관의 이십 년 기능과 교체 횟수에 따른 부분 배출 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,/g, ""))));
  assert.deepEqual(service, [[2500, 2600, 2600], [0, 0, 2600], [100, 150, 300], [2600, 2750, 5500], [130, 137.5, 275]]);
  for (let i = 0; i < 3; i++) {
    assert.equal(service[0][i] + service[1][i] + service[2][i], service[3][i]);
    assert.equal(service[3][i] / 20, service[4][i]);
  }
}
if (reviewIds.has("27")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/27.html"), "utf8"));
  const stages = dom('div[aria-label="가상 폐플라스틱의 수거 선별 열분해 및 규격 원료 질량 수지"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text().replace(/,/g, "")));
  assert.deepEqual(stages, [1000, 800, 480]);
  assert.equal(800 + 200, stages[0]);
  assert.equal(480 + 200 + 120, stages[1]);
  assert.equal(400 + 80, stages[2]);
  assert.equal(200 + 200 + 120 + 400 + 80, stages[0]);
  assert.equal(480 / 800 * 100, 60);
  assert.equal(480 / 1000 * 100, 48);
  assert.equal(400 / 1000 * 100, 40);
  assert.equal(400 / 800 * 100, 50);
  assert.equal(Math.round(400 / 480 * 1000) / 10, 83.3);
  const attribution = dom('div[aria-label="가상 인증 원료의 공정 손실과 제품별 귀속량 계산"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text()));
  assert.deepEqual(attribution, [100, 900, 800, 80, 40, 40]);
  assert.equal((attribution[0] + attribution[1]) * 0.8, attribution[2]);
  assert.equal(attribution[0] * 0.8, attribution[3]);
  assert.equal(attribution[4] + attribution[5], attribution[3]);
  assert.equal(attribution[4] / 200 * 100, 20);
  assert.equal(Math.round(attribution[5] / 600 * 1000) / 10, 6.7);
}
if (reviewIds.has("26")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/26.html"), "utf8"));
  const output = dom('div[aria-label="가상 제조 라인의 정지 속도 품질과 양품 생산 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,/g, ""))));
  assert.deepEqual(output, [[100, 100], [20, 10], [80, 90], [7200, 7650], [6840, 6885], [80, 90], [90, 85], [95, 90], [68.4, 68.85]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(output[0][i] - output[1][i], output[2][i]);
    assert.equal(output[2][i] / output[0][i] * 100, output[5][i]);
    assert.equal(output[3][i] / (output[2][i] * 100) * 100, output[6][i]);
    assert.equal(output[4][i] / output[3][i] * 100, output[7][i]);
    assert.equal(Math.round(output[5][i] * output[6][i] * output[7][i] / 100) / 100, output[8][i]);
    assert.equal(output[4][i] / (output[0][i] * 100) * 100, output[8][i]);
  }
  assert.equal(Math.round((6885 - 6840) / 6840 * 10000) / 100, 0.66);
  const time = dom('div[aria-label="가상 주간 생산 계획 시간과 달력 시간의 가동 비율 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(time, [[168, 168], [120, 100], [108, 95], [90, 95], [64.3, 56.5]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(time[2][i] / time[1][i] * 100, time[3][i]);
    assert.equal(Math.round(time[2][i] / time[0][i] * 1000) / 10, time[4][i]);
  }
}
const mineralShaleResearchReviews = {
  "25": [/2023년 10월 9일/, /인쇄 35쪽/, /연간 CO₂ 400톤/, /2026년 첫 장치 시험 계획/, /60 \+ 60 = 120톤으로 합산하면 안 된다/, /60 - 55 - 10 = -5/, /모두 직접 공기 포집에서 왔다고 추가 가정/, /같은 60톤 고정을 대기 제거라고 부르지 않는다/],
  "24": [/2026년 2월 26일/, /2025년 12월 시작/, /100 - 30 \+ 40 = 110/, /49 \+ 28 = 77/, /10 × 30 \+ 7 × 30 \+ 5 × 30 = 660/, /≈ 36\.4%/, /담수 취수 감소율도 확정할 수 없다/, /600 ÷ 1,000을 이번 주입액의 회수율로 쓰지 않는다/],
  "23": [/2025년 4월 말까지/, /사우디 내 R&amp;D 센터 4개/, /숫자를 골라 합친 13개/, /직접 프로그램 비용과 추정 간접비/, /585 ÷ 974 ≈ 60\.1%/, /818 × 20% = 163\.6/, /정확히 164건이라고 재게시하지 않는다/, /가상 자료/, /패밀리 수가 제품 수와 일치하지도 않는다/],
};
for (const [id, claims] of Object.entries(mineralShaleResearchReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Mineralization, shale and research evidence boundary: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|아는)|저는 과거|현장에서 직접 확인한/, `No invented personal experience: ${id}`);
}
if (reviewIds.has("25")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/25.html"), "utf8"));
  const carbon = dom('div[aria-label="가상 광물화의 기존 탄산염과 새 고정량 및 가스 수지"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text()));
  assert.deepEqual(carbon, [20, 80, 60, 100, 40]);
  assert.equal(carbon[1] - carbon[0], carbon[2]);
  assert.equal(carbon[3] - carbon[4], carbon[2]);
  assert.equal(carbon[2] / carbon[3] * 100, 60);
  const net = dom('div[aria-label="가상 대기 유래 CO2 광물화의 총고정과 전 과정 순효과 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(net, [[60, 60], [20, 55], [10, 10], [30, -5]]);
  for (let i = 0; i < 2; i++) assert.equal(net[0][i] - net[1][i] - net[2][i], net[3][i]);
}
if (reviewIds.has("24")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/24.html"), "utf8"));
  const cohorts = dom('div[aria-label="가상 기존 우물과 신규 우물 집단의 시점별 가스 생산율"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(cohorts, [[100, 70, 49], [0, 40, 28], [0, 0, 30], [100, 110, 107]]);
  for (let i = 0; i < 3; i++) assert.equal(cohorts.slice(0, 3).reduce((sum, row) => sum + row[i], 0), cohorts[3][i]);
  assert.equal(110 - 49 - 28, 33);
  const volume = dom('div[aria-label="가상 우물의 월평균 생산율과 구십 일 누적 가스량"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/약 /g, ""))));
  assert.deepEqual(volume, [[10, 300], [7, 210], [5, 150], [7.33, 660]]);
  for (const row of volume.slice(0, 3)) assert.equal(row[0] * 30, row[1]);
  assert.equal(volume.slice(0, 3).reduce((sum, row) => sum + row[1], 0), volume[3][1]);
  assert.equal(Math.round(volume[3][1] / 90 * 100) / 100, volume[3][0]);
  assert.equal(Math.round((10 * 90 - 660) / 660 * 1000) / 10, 36.4);
  const water = dom('div[aria-label="가상 파쇄 용수 공급과 회수수 재이용의 서로 다른 분모"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text().replace(/,/g, ""))));
  assert.deepEqual(water, [[300, 600, 50], [300, 1000, 30], [700, 1000, 70]]);
  for (const row of water) assert.equal(row[0] / row[1] * 100, row[2]);
  assert.equal(water[1][0] + water[2][0], water[1][1]);
}
if (reviewIds.has("23")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/23.html"), "utf8"));
  const spend = dom('div[aria-label="아람코 보고서의 연도별 연구개발비와 지속가능성 기술 지출"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(spend, [[540, 623, 585], [861, 996, 974], [63, 63, 60]]);
  for (let i = 0; i < 3; i++) assert.equal(Math.round(spend[0][i] / spend[1][i] * 100), spend[2][i]);
  assert.equal(Math.round(585 / 974 * 1000) / 10, 60.1);
  assert.equal(623 - 585, 38);
  assert.equal(Math.round((623 - 585) / 623 * 1000) / 10, 6.1);
  const patents = dom('div[aria-label="가상 연구 성과의 출원 건수와 특허 패밀리 집계"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(patents, [[4, 1], [3, 1], [2, 1], [9, 3]]);
  for (let i = 0; i < 2; i++) assert.equal(patents.slice(0, 3).reduce((sum, row) => sum + row[i], 0), patents[3][i]);
  assert.equal(Math.round(818 * 0.2 * 10) / 10, 163.6);
}
const standardsCorrosionNanoReviews = {
  "22": [/2026년 9월 16일/, /모든 기존 인증의 즉시 무효/, /비복원 추출/, /무검출일 때 로트가 무결점일 확률/, /940 ÷ 1,000 = 94%/, /980 ÷ 1,000 = 98%/, /유료 표준 전문을 검토하거나/],
  "21": [/2025년 11월 11일/, /매개변수 40,000개는 두께 센서 40,000개/, /약 5개월 노출/, /100\.000 - 0\.200 \+ 0\.250 = 100\.050g/, /평균의 3\.2배/, /실제 배관 면적을 대표하는 표본 설계는 아니다/, /허용 압력, 검사 주기나 운전 계속 여부를 정하지 않는다/],
  "20": [/Autonomous Reservoir Nano-Agents/, /2020년 4월 17일/, /자유롭게 이동하는 나노 입자라고 특정하지 않는다/, /\(11\.5 - 2\) ÷ 10 × 100 = 95%/, /\(9 - 2\) ÷ 10 × 100 = 70%/, /분석상의 첨가 회수율/, /2026년 현장 나노 센서의 승인 기준이 아니다/, /사건에서 보고까지는 8시간/],
};
for (const [id, claims] of Object.entries(standardsCorrosionNanoReviews)) {
  if (!reviewIds.has(id)) continue;
  const content = await readFile(path.join(root, "data/reviewed", `${id}.html`), "utf8");
  for (const claim of claims) assert.match(content, claim, `Standards, corrosion and nano evidence boundary: ${id}`);
  assert.match(content, /가상/);
  assert.doesNotMatch(content, /제가 (?:직접|과거|아는)|저는 과거|현장에서 직접 확인한/, `No invented personal experience: ${id}`);
}
if (reviewIds.has("22")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/22.html"), "utf8"));
  const samples = dom('div[aria-label="가상 천 개 로트에서 표본 크기별 불량 미검출 확률"] tbody tr').toArray().map(row => [Number(dom(row).find("th").text()), Number(dom(row).find("td").first().text().replace("%", ""))]);
  assert.deepEqual(samples, [[50, 35.5], [100, 11.9], [200, 1.1]]);
  for (const [n, expected] of samples) {
    let zeroDefects = 1;
    for (let i = 0; i < n; i++) zeroDefects *= (980 - i) / (1000 - i);
    assert.equal(Math.round(zeroDefects * 1000) / 10, expected);
  }
  const yieldCounts = dom('div[aria-label="가상 최초 검사와 재작업 후 최종 합격의 고유 제품 집계"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text().replace(/,/g, "")));
  assert.deepEqual(yieldCounts, [1000, 940, 60, 40, 20, 980]);
  assert.equal(yieldCounts[1] + yieldCounts[2], yieldCounts[0]);
  assert.equal(yieldCounts[3] + yieldCounts[4], yieldCounts[2]);
  assert.equal(yieldCounts[1] + yieldCounts[3], yieldCounts[5]);
  assert.equal(yieldCounts[1] / yieldCounts[0] * 100, 94);
  assert.equal(yieldCounts[5] / yieldCounts[0] * 100, 98);
}
if (reviewIds.has("21")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/21.html"), "utf8"));
  const mass = dom('div[aria-label="가상 부식 시편의 금속 손실과 침전물에 따른 질량 수지"] tbody tr').toArray().map(row => Number(dom(row).find("td").first().text()));
  assert.deepEqual(mass, [100, 0.2, 99.8, 0.25, 100.05, 0.05]);
  assert.ok(Math.abs(mass[0] - mass[1] - mass[2]) < 1e-9);
  assert.ok(Math.abs(mass[2] + mass[3] - mass[4]) < 1e-9);
  assert.ok(Math.abs(mass[4] - mass[0] - mass[5]) < 1e-9);
  const thickness = dom('div[aria-label="가상 네 측정점의 잔존 두께와 국부 손실 비교"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(thickness, [[10, 9.9, 0.1], [10, 9.9, 0.1], [10, 9.9, 0.1], [10, 8.8, 1.2], [10, 9.625, 0.375]]);
  for (const row of thickness) assert.ok(Math.abs(row[0] - row[1] - row[2]) < 1e-9);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(thickness.slice(0, 4).reduce((sum, row) => sum + row[i], 0) / 4 - thickness[4][i]) < 1e-9);
  assert.ok(Math.abs(thickness[3][2] / thickness[4][2] - 3.2) < 1e-9);
}
if (reviewIds.has("20")) {
  const dom = cheerio.load(await readFile(path.join(root, "data/reviewed/20.html"), "utf8"));
  const spike = dom('div[aria-label="가상 기준 매질과 염분 시료의 분석 첨가 회수율 계산"] tbody tr').toArray().map(row => dom(row).find("td").toArray().map(cell => Number(dom(cell).text())));
  assert.deepEqual(spike, [[2, 2], [10, 10], [11.5, 9], [9.5, 7], [95, 70]]);
  for (let i = 0; i < 2; i++) {
    assert.equal(spike[2][i] - spike[0][i], spike[3][i]);
    assert.equal(spike[3][i] / spike[1][i] * 100, spike[4][i]);
  }
  const times = dom('div[aria-label="가상 현장 사건부터 시료 채취 분석과 보고까지의 시간 기록"] tbody tr').toArray().map(row => dom(row).find("td").first().text());
  assert.deepEqual(times, ["12:00", "13:00", "15:00", "19:00", "20:00"]);
  const hours = times.map(value => Number(value.split(":")[0]));
  assert.equal(hours[4] - hours[0], 8);
  assert.equal(hours[4] - hours[1], 7);
  assert.equal(hours[3] - hours[2], 4);
}
console.log(JSON.stringify({ articles: posts.length, reviewed: report, unchangedLegacyArticles: legacy.length, legacyHash }, null, 2));
