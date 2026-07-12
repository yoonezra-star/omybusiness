import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "dist");
const port = Number(process.env.PORT || 8787);

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function resolveFile(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(root, normalized);

  if (existsSync(file) && statSync(file).isDirectory()) {
    file = path.join(file, "index.html");
  }

  if (!existsSync(file) && !path.extname(file)) {
    file = path.join(file, "index.html");
  }

  if (!existsSync(file)) {
    file = path.join(root, "404.html");
  }

  return file;
}

createServer((request, response) => {
  const file = resolveFile(request.url || "/");
  response.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
  response.statusCode = file.endsWith("404.html") ? 404 : 200;
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Preview running at http://127.0.0.1:${port}`);
});
