import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const sourceBase = "https://march0314-1.tistory.com";
const siteUrl = "https://omybusiness.com";
const userAgent =
  "Mozilla/5.0 (compatible; omybusiness-static-migrator/1.0; +https://omybusiness.com)";

const dataDir = path.join(root, "data");
const imageDir = path.join(root, "public", "assets", "img");

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": userAgent } });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { "user-agent": userAgent } });
  if (!response.ok) {
    throw new Error(`Failed to fetch image ${url}: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

function extractSitemapUrls(xml) {
  const urlBlocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);
  return urlBlocks.map((block) => {
    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim();
    const lastmod = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]?.trim() || null;
    return { loc, lastmod };
  }).filter((item) => item.loc);
}

function decodePathname(url) {
  return decodeURIComponent(new URL(url).pathname);
}

function cleanText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function meta($, selector) {
  return $(selector).attr("content")?.trim() || "";
}

function extensionFrom(url, contentType) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).replace(/[^.\w]/g, "").toLowerCase();
  if (ext) return ext;
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("gif")) return ".gif";
  return ".img";
}

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${sourceBase}${url}`;
  return url;
}

function toLocalLink(href) {
  if (!href) return href;
  const normalized = resolveUrl(href);
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === "march0314-1.tistory.com" || parsed.hostname === "omybusiness.com") {
      return decodeURIComponent(parsed.pathname);
    }
  } catch {
    return href;
  }
  return href;
}

async function localizeImages($, content, key) {
  const fragment = cheerio.load(content, null, false);
  const images = fragment("img").toArray();
  let index = 0;

  for (const image of images) {
    const node = fragment(image);
    const original =
      node.parent("[data-url]").attr("data-url") ||
      node.attr("data-url") ||
      node.attr("src");
    const imageUrl = resolveUrl(original);
    if (!imageUrl || imageUrl.startsWith("data:")) continue;

    try {
      const { buffer, contentType } = await fetchBuffer(imageUrl);
      const filename = `${key}-${String(index + 1).padStart(2, "0")}${extensionFrom(
        imageUrl,
        contentType,
      )}`;
      await writeFile(path.join(imageDir, filename), buffer);
      node.attr("src", `/assets/img/${filename}`);
      node.removeAttr("srcset");
      node.removeAttr("onerror");
      node.removeAttr("data-filename");
      node.removeAttr("data-origin-width");
      node.removeAttr("data-origin-height");
      index += 1;
    } catch (error) {
      console.warn(`Image kept remote (${imageUrl}): ${error.message}`);
      node.attr("src", imageUrl);
      node.removeAttr("srcset");
    }
  }

  return fragment.html();
}

function extractContent($) {
  const content = $(".entry-content").first().clone();
  if (!content.length) return "";
  content.find("script, style, .container_postbtn, .another_category").remove();
  content.find("a").each((_, element) => {
    const link = $(element);
    link.attr("href", toLocalLink(link.attr("href")));
  });
  return content.html()?.trim() || "";
}

function extractEntryId(html) {
  return (
    html.match(/window\.T\.entryInfo\s*=\s*\{[^}]*entryId":?(\d+)/)?.[1] ||
    html.match(/entryId['"]?\s*:\s*['"]?(\d+)/)?.[1] ||
    ""
  );
}

function extractCategory(html) {
  return (
    html.match(/categoryLabel":"([^"]+)"/)?.[1] ||
    html.match(/"categoryName":"([^"]+)"/)?.[1] ||
    "회사"
  );
}

function excerptFromHtml(html, fallback = "") {
  const fragment = cheerio.load(html, null, false);
  const text = cleanText(fragment.text());
  return text.slice(0, 180) || fallback;
}

function slugKey(routePath, fallback) {
  const slug = routePath.split("/").filter(Boolean).pop() || fallback;
  return slug.normalize("NFKD").replace(/[^\w가-힣-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;
}

async function migrateEntry(item, order) {
  const html = await fetchText(item.loc);
  const $ = cheerio.load(html);
  const routePath = decodePathname(item.loc);
  const entryId = extractEntryId(html);
  const rawContent = extractContent($);
  const key = entryId || slugKey(routePath, `post-${order + 1}`);
  const content = await localizeImages($, rawContent, key);
  const title = meta($, 'meta[property="og:title"]') || $("h1").first().text().trim();
  const description = meta($, 'meta[name="description"]') || excerptFromHtml(content);
  const image = cheerio.load(content, null, false)("img").first().attr("src") || "";

  return {
    id: entryId || String(order + 1),
    title,
    description: cleanText(description),
    category: extractCategory(html),
    sourceUrl: item.loc,
    routePath,
    numericPath: entryId ? `/${entryId}` : "",
    publishedAt: meta($, 'meta[property="article:published_time"]') || item.lastmod,
    modifiedAt: meta($, 'meta[property="article:modified_time"]') || item.lastmod,
    image,
    content,
  };
}

async function migratePage(item, order) {
  const html = await fetchText(item.loc);
  const $ = cheerio.load(html);
  const routePath = decodePathname(item.loc);
  const rawContent = extractContent($);
  const content = await localizeImages($, rawContent, `page-${order + 1}`);
  const title = meta($, 'meta[property="og:title"]') || $("h1").first().text().trim() || "페이지";

  return {
    title,
    description: meta($, 'meta[name="description"]') || excerptFromHtml(content),
    sourceUrl: item.loc,
    routePath,
    modifiedAt: meta($, 'meta[property="article:modified_time"]') || item.lastmod,
    content,
  };
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(imageDir, { recursive: true });

  const sitemapXml = await fetchText(`${sourceBase}/sitemap.xml`);
  await writeFile(path.join(dataDir, "source-sitemap.xml"), sitemapXml);
  const urls = extractSitemapUrls(sitemapXml);
  const entryItems = urls.filter((item) => new URL(item.loc).pathname.startsWith("/entry/"));
  const pageItems = urls.filter((item) => new URL(item.loc).pathname.startsWith("/pages/"));

  const posts = [];
  for (const [index, item] of entryItems.entries()) {
    console.log(`Migrating post ${index + 1}/${entryItems.length}: ${decodePathname(item.loc)}`);
    posts.push(await migrateEntry(item, index));
  }

  const pages = [];
  for (const [index, item] of pageItems.entries()) {
    console.log(`Migrating page ${index + 1}/${pageItems.length}: ${decodePathname(item.loc)}`);
    pages.push(await migratePage(item, index));
  }

  posts.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const site = {
    title: "omybusiness",
    url: siteUrl,
    description:
      "omybusiness는 비지니스 관련 정보를 제공하는 사이트입니다. 중동의 비지니스 관련 정보를 우선 제공합니다.",
    sourceBase,
    migratedAt: new Date().toISOString(),
  };

  await writeFile(path.join(dataDir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
  await writeFile(path.join(dataDir, "posts.json"), `${JSON.stringify(posts, null, 2)}\n`);
  await writeFile(path.join(dataDir, "pages.json"), `${JSON.stringify(pages, null, 2)}\n`);

  console.log(`Done. Migrated ${posts.length} posts and ${pages.length} pages.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
