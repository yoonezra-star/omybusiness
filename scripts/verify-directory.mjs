import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const posts = JSON.parse(await readFile(path.join(root, "data/posts.json"), "utf8"));
const catalog = JSON.parse(await readFile(path.join(root, "data/article-catalog.json"), "utf8"));
assert.ok((await stat(path.join(dist, "assets/lucide-license.txt"))).isFile(), "Redistributed icon license");
assert.equal(catalog.length, posts.length);
assert.equal(new Set(catalog.map(entry => entry.id)).size, posts.length);
assert.equal(new Set(catalog.map(entry => entry.question)).size, posts.length, "Distinct planned reader questions");
for (const route of ["/", "/archive/", "/category/energy/", "/tag/"]) {
  const dom = cheerio.load(await readFile(path.join(dist, route, "index.html"), "utf8"));
  assert.equal(dom(".post-card").length, posts.length, `Complete article directory: ${route}`);
  assert.equal(dom(".post-card[hidden]").length, 0, "All articles remain readable without JavaScript");
  assert.equal(dom("#postSearch").length, 1);
  assert.equal(dom("#postTopic option").length, 6);
  assert.equal(dom("#postSort option").length, 3);
  assert.equal(dom("form[role=search]").attr("method"), "get");
  assert.equal(dom(".directory-search").next().attr("class"), "directory-controls");
  assert.equal(dom(".desktop-nav a").length, 5);
  assert.equal(dom(".mobile-navigation nav a").length, 5);
  assert.equal(dom(".mobile-navigation summary svg[aria-hidden=true]").length, 1);
  assert.equal(dom("[data-filter]").length, 0, "No legacy pill filter row");
  assert.equal(dom(".value-panel,.trust-strip,.start-panel,.visual-lead").length, 0, "No explanatory blocks before content");
  const script = dom('script[src^="/assets/directory."]').attr("src");
  assert.match(script, /^\/assets\/directory\.[a-f0-9]{12}\.js$/);
  assert.ok((await stat(path.join(dist, script))).isFile());
  for (const card of dom(".post-card").toArray()) {
    const entry = catalog.find(item => item.id === dom(card).attr("data-post-id"));
    assert.equal(dom(card).attr("data-topic"), entry.topic, `Explicit topic for ${entry.id}`);
    assert.ok(dom(card).attr("data-search").includes(dom(card).attr("data-title")));
  }
}
const bodies = [];
for (const post of posts) {
  const dom = cheerio.load(await readFile(path.join(dist, post.routePath, "index.html"), "utf8"));
  bodies.push([post.id, dom(".entry-content").html()]);
}
const bodyHash = createHash("sha256").update(JSON.stringify(bodies)).digest("hex");
if (process.argv[2]) assert.equal(bodyHash, process.argv[2], "All article bodies must remain unchanged during navigation edits");

let htmlCount = 0;
let links = 0;
const missing = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (!file.endsWith(".html")) continue;
    htmlCount++;
    const dom = cheerio.load(await readFile(file, "utf8"));
    for (const anchor of dom('a[href^="/"]').toArray()) {
      const href = dom(anchor).attr("href");
      if (href.startsWith("//")) continue;
      const route = decodeURI(href.split(/[?#]/)[0]);
      links++;
      const target = route.endsWith(".xml") || route.endsWith(".txt") ? path.join(dist, route) : path.join(dist, route, "index.html");
      try { assert.ok((await stat(target)).isFile()); } catch { missing.push({ file, href }); }
    }
  }
}
await inspect(dist);
assert.deepEqual(missing, [], "Every internal navigation destination exists");
console.log(JSON.stringify({ catalogArticles: catalog.length, bodyHash, generatedHtml: htmlCount, checkedInternalLinks: links, missing }, null, 2));
