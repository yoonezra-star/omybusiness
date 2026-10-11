import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "adsense-audit");
const posts = JSON.parse(await readFile(path.join(root, "data", "posts.json"), "utf8"));
const compact = (value) => value.replace(/\s+/g, "").normalize("NFC");
const plain = (value) => value.replace(/\s+/g, " ").trim();
const experiencePattern = /(?:저는 과거|제가 과거|직접 목격|현장을 시찰|시설을 방문|프로젝트에 참여|현장에서 느꼈|현장에서 마주|항만 인근에서 근무|제가 만난 업계|20년 가까이)/;

function textOf(html, selector) {
  const $ = cheerio.load(html);
  $("script,style,.container_postbtn,.another_category").remove();
  return plain(selector ? $(selector).first().text() : $("body").text());
}

function editorialBody(html) {
  const $ = cheerio.load(html);
  $("script,style,figure.imageblock,div.imageblock,span[data-phocus],span[data-url]").remove();
  return plain($("body").text());
}

function shingles(text, size = 20) {
  const value = compact(text);
  const result = new Set();
  for (let i = 0; i <= value.length - size; i++) result.add(value.slice(i, i + size));
  return result;
}

function overlap(left, right) {
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return {
    containment: left.size ? shared / left.size : 0,
    jaccard: left.size + right.size - shared ? shared / (left.size + right.size - shared) : 0,
  };
}

async function filesBelow(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) files.push(...await filesBelow(target));
    else files.push(target);
  }
  return files;
}

const paragraphs = new Map();
const rows = [];
for (const post of posts) {
  const $ = cheerio.load(post.content);
  $("script,style").remove();
  const original = plain($("body").text());
  const renderedHtml = await readFile(path.join(root, "dist", post.routePath, "index.html"), "utf8");
  const rendered = cheerio.load(renderedHtml);
  const snippets = $("p").map((_, node) => plain($(node).text())).get().filter((text) => experiencePattern.test(text));
  const externalLinks = $("a[href]").map((_, node) => $(node).attr("href")).get().filter((url) => /^https?:\/\//.test(url));
  const genericParagraphs = new Set(rendered(".content-enhancement p,.content-enhancement li,.article-takeaways p,.editor-note p")
    .map((_, node) => plain(rendered(node).text())).get().filter((text) => text.length >= 40));
  for (const paragraph of genericParagraphs) paragraphs.set(paragraph, (paragraphs.get(paragraph) || 0) + 1);
  rows.push({
    id: post.id,
    title: post.title,
    path: post.routePath,
    sourceUrl: post.sourceUrl,
    publishedAt: post.publishedAt,
    modifiedAt: post.modifiedAt,
    bodyChars: original.length,
    descriptionChars: post.description.length,
    externalLinks,
    originalTables: $("table").length,
    originalBodyPreserved: compact(editorialBody(post.content)) === compact(textOf(renderedHtml, ".entry-content")),
    hasDeepAnalysis: rendered(".deep-analysis").length > 0,
    hasVisibleAuthor: rendered(".article-header a[href='/author/']").length > 0,
    experienceNeedsVerification: snippets.length > 0,
    experienceExamples: snippets.slice(0, 2),
    percentageExamples: original.match(/.{0,40}\d+(?:\.\d+)?\s*(?:%|퍼센트|배).{0,60}/g)?.slice(0, 5) || [],
    original,
  });
}

const sets = rows.map((row) => shingles(row.original));
const pairs = [];
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const result = overlap(sets[i], sets[j]);
    pairs.push({ left: rows[i].id, right: rows[j].id, leftTitle: rows[i].title, rightTitle: rows[j].title, ...result });
  }
}
pairs.sort((a, b) => b.jaccard - a.jaccard);

async function inspect(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const html = await response.text();
    const $ = cheerio.load(html);
    return { requestedUrl: url, finalUrl: response.url, status: response.status,
      title: $("title").text(), canonical: $("link[rel='canonical']").attr("href") || null,
      robots: $("meta[name='robots']").attr("content") || null,
      xRobotsTag: response.headers.get("x-robots-tag"), html };
  } catch (error) {
    return { requestedUrl: url, error: error.message };
  }
}

async function limitedMap(items, fn, concurrency = 4) {
  const results = Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

const sampleIds = ["84", "83", "81", "73", "71", "70", "67", "2"];
const samplePosts = rows.filter((post) => sampleIds.includes(post.id));
const sourceSamples = await limitedMap(samplePosts, async (post) => {
  const result = await inspect(post.sourceUrl);
  const { html, ...metadata } = result;
  const sourceText = html ? textOf(html, ".entry-content") : "";
  const live = await inspect(`https://omybusiness.com${post.path}`);
  const liveText = live.html ? textOf(live.html, ".entry-content") : "";
  const dataPost = posts.find((item) => item.id === post.id);
  return { id: post.id, title: post.title, ...metadata, hasArticle: sourceText.length > 500,
    sourceChars: sourceText.length, exactBodyMatch: !!sourceText && compact(sourceText) === compact(post.original),
    destinationStatus: live.status, destinationBodyPreserved: !!liveText && compact(liveText) === compact(editorialBody(dataPost.content)),
    overlap: sourceText ? overlap(shingles(post.original), shingles(sourceText)) : null };
});

const buildSource = await readFile(path.join(root, "scripts", "build.js"), "utf8");
const librarySource = buildSource.split("const sourceLibrary = {")[1].split("function stripHtml")[0];
const libraryUrls = [...librarySource.matchAll(/url: "([^"]+)"/g)].map((match) => match[1]);
const sourceLinks = await limitedMap(libraryUrls, async (url) => {
  const { html, ...metadata } = await inspect(url);
  return metadata;
});
const liveUrls = ["/", "/archive/", "/author/", "/tools/energy-risk-matrix/", "/sitemap.xml", "/robots.txt", "/ads.txt", "/audit-not-a-real-page-20261011/"];
const liveChecks = await limitedMap(liveUrls, async (route) => {
  const { html, ...metadata } = await inspect(`https://omybusiness.com${route}`);
  const $ = cheerio.load(html || "");
  return { ...metadata, mainChars: plain($("main").text()).length,
    adScriptCount: $("script[src*='googlesyndication'],script[src*='adsbygoogle']").length,
    interactiveControls: $("main input,main select,main button").length,
    excerpt: route === "/ads.txt" || route === "/robots.txt" ? html?.slice(0, 400) : undefined };
});

const htmlFiles = (await filesBelow(path.join(root, "dist"))).filter((file) => file.endsWith(".html"));
const dates = rows.map((row) => row.publishedAt).sort();
const sizes = rows.map((row) => row.bodyChars).sort((a, b) => a - b);
const report = {
  auditDate: "2026-10-11",
  scope: "Local census of 82 posts, 8 live Tistory samples, 8 shared source links, 8 live endpoint samples. Flags require editorial review; this is not a Google approval score or plagiarism verdict.",
  totals: { posts: rows.length, generatedHtml: htmlFiles.length,
    originalBodyPreserved: rows.filter((row) => row.originalBodyPreserved).length,
    noOriginalExternalLinks: rows.filter((row) => row.externalLinks.length === 0).length,
    originalTables: rows.filter((row) => row.originalTables > 0).length,
    withDeepAnalysis: rows.filter((row) => row.hasDeepAnalysis).length,
    visibleArticleAuthors: rows.filter((row) => row.hasVisibleAuthor).length,
    experienceFlagged: rows.filter((row) => row.experienceNeedsVerification).length,
    bodyChars: { minimum: sizes[0], median: sizes[Math.floor(sizes.length / 2)], maximum: sizes.at(-1) },
    publishedRange: [dates[0], dates.at(-1)],
  },
  repeatedEditorialParagraphs: [...paragraphs].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([text, postCount]) => ({ text, postCount })),
  mostSimilarLocalPairs: pairs.slice(0, 12),
  sourceSamples, sourceLinks, liveChecks,
  posts: rows.map(({ original, ...row }) => row),
};
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "evidence.json"), `${JSON.stringify(report, null, 2)}\n`);
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const headers = ["id", "title", "url", "sourceUrl", "bodyChars", "originalExternalLinks", "experienceNeedsVerification", "deepAnalysis", "priorityAction"];
const csvRows = rows.map((row) => [row.id, row.title, `https://omybusiness.com${row.path}`, row.sourceUrl, row.bodyChars, row.externalLinks.length, row.experienceNeedsVerification, row.hasDeepAnalysis,
  row.experienceNeedsVerification ? "Verify experience and claims; rebuild article from documented sources" : row.externalLinks.length === 0 ? "Map claims to primary sources; add specific original analysis" : "Review citation support, distinct purpose, and topic overlap"]);
await writeFile(path.join(output, "content-inventory.csv"), `\uFEFF${[headers, ...csvRows].map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`);
console.log(JSON.stringify({ totals: report.totals, repeated: report.repeatedEditorialParagraphs.slice(0, 4),
  sourceSamples: sourceSamples.map(({id,status,canonical,exactBodyMatch,destinationStatus,destinationBodyPreserved}) => ({id,status,canonical,exactBodyMatch,destinationStatus,destinationBodyPreserved})),
  sourceLinks: sourceLinks.map(({status,title,error}) => ({status,title,error})),
  liveChecks: liveChecks.map(({requestedUrl,status,title,interactiveControls,error}) => ({requestedUrl,status,title,interactiveControls,error})),
  topLocalPairs: report.mostSimilarLocalPairs.slice(0, 3), output }, null, 2));
