import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const rawSite = JSON.parse(await readFile(path.join(root, "data", "site.json"), "utf8"));
const rawPosts = JSON.parse(await readFile(path.join(root, "data", "posts.json"), "utf8"));

const site = {
  ...rawSite,
  title: "omybusiness",
  description:
    "omybusiness는 중동 비즈니스, 에너지 산업, 사우디아람코와 산업 기술 변화를 쉽게 이해할 수 있도록 정리하는 비즈니스 인사이트 아카이브입니다.",
};

function repairMojibake(value = "") {
  const text = String(value);
  const hangulCount = (text.match(/[가-힣]/g) || []).length;
  const mojibakeCount = (text.match(/[ìíëêð]/g) || []).length;
  if (mojibakeCount === 0 || hangulCount > mojibakeCount) return text;

  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    const repairedHangulCount = (repaired.match(/[가-힣]/g) || []).length;
    return repairedHangulCount > hangulCount ? repaired : text;
  } catch {
    return text;
  }
}

function normalizePost(post) {
  return {
    ...post,
    title: repairMojibake(post.title),
    description: repairMojibake(post.description),
    category: "에너지 산업",
    content: sanitizeContent(repairMojibake(post.content)),
  };
}

function sanitizeContent(html = "") {
  return String(html)
    .replace(/<!--\s*inventory\s*-->/gi, "")
    .replace(/<!--\s*System\s*-\s*START\s*-->[\s\S]*?<!--\s*System\s*-\s*END\s*-->/gi, "")
    .replace(/<ins\b[^>]*class=["'][^"']*adsbygoogle[^"']*["'][^>]*>[\s\S]*?<\/ins>/gi, "")
    .replace(/<div\b[^>]*data-tistory-react-app=["']NaverAd["'][^>]*><\/div>/gi, "")
    .replace(/\sdata-ad-[a-z-]+=["'][^"']*["']/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const posts = rawPosts.map(normalizePost);

const trustPages = [
  {
    title: "사이트 소개",
    routePath: "/about/",
    description: "omybusiness의 운영 목적과 다루는 주제를 소개합니다.",
    modifiedAt: site.migratedAt,
    content: `
      <p>omybusiness는 중동 비즈니스와 에너지 산업의 흐름을 독자가 이해하기 쉬운 언어로 정리하는 정보 사이트입니다. 사우디아람코, 탄소 저감 기술, 친환경 소재, 스마트 팩토리, 공급망 변화처럼 앞으로 산업 경쟁력에 영향을 줄 수 있는 주제를 중심으로 다룹니다.</p>
      <p>각 글은 단순한 뉴스 요약보다 산업적 맥락, 기술의 의미, 기업 전략의 방향을 함께 설명하는 데 초점을 둡니다. 전문 용어는 가능한 한 풀어서 설명하고, 독자가 한 편의 글 안에서 배경과 시사점을 같이 파악할 수 있도록 구성합니다.</p>
      <h2>다루는 주제</h2>
      <ul>
        <li>중동 주요 기업과 산업 동향</li>
        <li>에너지 전환과 저탄소 기술</li>
        <li>사우디아람코의 기술, 공급망, 투자 전략</li>
        <li>스마트 팩토리, 디지털 전환, 소재 혁신 사례</li>
      </ul>
    `,
  },
  {
    title: "문의",
    routePath: "/contact/",
    description: "omybusiness 운영자에게 문의하는 방법을 안내합니다.",
    modifiedAt: site.migratedAt,
    content: `
      <p>사이트 운영, 콘텐츠 정정 요청, 제휴 문의는 아래 이메일로 연락해 주세요.</p>
      <p><strong>이메일:</strong> <a href="mailto:yoonezra@gmail.com">yoonezra@gmail.com</a></p>
      <p>문의 내용에는 확인이 필요한 글 주소와 요청 사항을 함께 적어주시면 더 빠르게 검토할 수 있습니다.</p>
    `,
  },
  {
    title: "개인정보처리방침",
    routePath: "/privacy-policy/",
    description: "omybusiness의 개인정보 처리 기준을 안내합니다.",
    modifiedAt: site.migratedAt,
    content: `
      <p>omybusiness는 방문자가 별도의 회원가입 없이 콘텐츠를 열람할 수 있는 정적 정보 사이트입니다. 사이트 자체적으로 이름, 주소, 전화번호 같은 개인정보를 직접 수집하지 않습니다.</p>
      <h2>수집될 수 있는 정보</h2>
      <p>Cloudflare, 검색엔진, 향후 광고 또는 분석 도구가 서비스 제공과 보안, 통계 목적을 위해 쿠키, 접속 로그, 브라우저 정보, 대략적인 지역 정보를 처리할 수 있습니다.</p>
      <h2>이용 목적</h2>
      <ul>
        <li>사이트 보안과 안정적인 접속 제공</li>
        <li>콘텐츠 품질 개선을 위한 방문 통계 확인</li>
        <li>광고 정책 준수와 부정 이용 방지</li>
      </ul>
      <h2>문의</h2>
      <p>개인정보 관련 문의는 <a href="mailto:yoonezra@gmail.com">yoonezra@gmail.com</a>으로 연락해 주세요.</p>
    `,
  },
  {
    title: "이용약관",
    routePath: "/terms/",
    description: "omybusiness 콘텐츠 이용 기준과 책임 범위를 안내합니다.",
    modifiedAt: site.migratedAt,
    content: `
      <p>omybusiness의 콘텐츠는 일반적인 정보 제공을 목적으로 작성됩니다. 투자, 법률, 세무, 사업 의사결정의 최종 판단은 독자 본인의 상황과 전문가 검토를 바탕으로 해야 합니다.</p>
      <h2>콘텐츠 이용</h2>
      <p>사이트의 글과 이미지는 저작권 보호를 받습니다. 출처를 밝힌 짧은 인용은 가능하지만, 전체 글의 무단 복제, 재배포, 자동 수집은 허용하지 않습니다.</p>
      <h2>외부 링크</h2>
      <p>글 안의 외부 링크는 참고 자료 확인을 돕기 위한 것입니다. 외부 사이트의 내용, 보안, 정책은 해당 사이트 운영자가 관리합니다.</p>
    `,
  },
  {
    title: "편집 기준",
    routePath: "/editorial-policy/",
    description: "omybusiness의 콘텐츠 작성 및 검토 기준을 안내합니다.",
    modifiedAt: site.migratedAt,
    content: `
      <p>omybusiness는 독자가 산업 흐름을 이해하는 데 도움이 되는 설명형 콘텐츠를 지향합니다. 사실과 의견을 구분하고, 가능한 경우 기업 공식 자료, 기관 보고서, 공신력 있는 보도자료 등 확인 가능한 근거를 참고합니다.</p>
      <h2>작성 원칙</h2>
      <ul>
        <li>핵심 주제를 명확히 설명하고 불필요한 과장을 줄입니다.</li>
        <li>기술 용어는 독자가 이해할 수 있도록 문맥과 함께 풀이합니다.</li>
        <li>오류가 확인되면 내용을 수정하거나 보완합니다.</li>
        <li>광고와 콘텐츠는 구분되도록 운영합니다.</li>
      </ul>
      <h2>정정 요청</h2>
      <p>오류나 보완이 필요한 내용은 <a href="mailto:yoonezra@gmail.com">yoonezra@gmail.com</a>으로 알려주세요.</p>
    `,
  },
];

const sourceLibrary = {
  annualReport: {
    label: "Aramco Annual Report",
    url: "https://www.aramco.com/en/investors/annual-report",
    note: "재무, 운영, upstream/downstream 전략을 확인할 수 있는 공식 연차보고서",
  },
  sustainabilityReport: {
    label: "Aramco Sustainability Report",
    url: "https://www.aramco.com/en/sustainability/sustainability-report",
    note: "탄소, 지속가능성, 안전, 환경 관련 공식 보고서",
  },
  digitalization: {
    label: "Aramco Digitalization",
    url: "https://www.aramco.com/en/what-we-do/energy-innovation/digitalization",
    note: "디지털 전환, 데이터, 운영 효율화 관련 공식 설명",
  },
  digitalInnovationCenters: {
    label: "Aramco Digital Innovation Centers",
    url: "https://www.aramco.com/en/what-we-do/energy-innovation/digitalization/our-digital-innovation-centers",
    note: "4차 산업혁명 기술과 upstream 디지털 혁신 사례",
  },
  globalResearch: {
    label: "Aramco Global Research Centers",
    url: "https://www.aramco.com/en/what-we-do/energy-innovation/global-research-centers",
    note: "글로벌 연구 네트워크와 기술 개발 방향",
  },
  houstonResearch: {
    label: "Aramco Research Center Houston",
    url: "https://americas.aramco.com/en/what-we-do/technology-and-innovation/aramco-research-center-houston",
    note: "지질, 지구물리, 저류층, 생산 관리 중심 upstream 연구",
  },
  beijingResearch: {
    label: "Aramco Beijing Research Center",
    url: "https://china.aramco.com/en/what-we-do/technology-development/beijing-research-center",
    note: "지질·지구물리, 유전 화학, 정유·화학, 지속가능 운송 연구",
  },
  investors: {
    label: "Aramco Investor Overview",
    url: "https://www.aramco.com/en/investors",
    note: "사업 구조, upstream/downstream 개요, 핵심 운영 지표",
  },
};

function stripHtml(html = "") {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeDescription(description = "") {
  const plain = stripHtml(description);
  const sentences = plain
    .split(/(?<=[.!?。！？]|다\.|요\.|죠\.)\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const fallback = plain ? [plain.slice(0, 130)] : [];
  return (sentences.length ? sentences : fallback).slice(0, 3);
}

function getArticleSources(title = "") {
  const sources = new Map();
  const add = (...keys) => keys.forEach((key) => sources.set(key, sourceLibrary[key]));

  add("annualReport", "globalResearch");

  if (/지진파|유전|수층|가스전|탐사|저류|시추|웰헤드/.test(title)) {
    add("houstonResearch", "digitalInnovationCenters");
  }

  if (/화학|촉매|윤활유|소재|탄소 나노|탄소 섬유|자동차|기유/.test(title)) {
    add("beijingResearch", "sustainabilityReport");
  }

  if (/AI|언어모델|블록체인|무선|보안|가스 검지|물류|자동화|그리드|디지털/.test(title)) {
    add("digitalization", "digitalInnovationCenters");
  }

  if (/바이오|탄소 가격|친환경|담수화|포럼|저탄소|수소|암모니아/.test(title)) {
    add("sustainabilityReport", "investors");
  }

  return [...sources.values()].filter(Boolean).slice(0, 5);
}

function renderArticleEnhancement(post, index) {
  if (index >= 20) return "";

  const summaryItems = summarizeDescription(post.description);
  const sources = getArticleSources(post.title);
  const perspective = [
    "본문의 주장과 수치는 기업 발표, 공식 보고서, 산업 기관 자료와 함께 교차 확인하는 것이 좋습니다.",
    "에너지·화학 산업은 유가, 규제, 기술 상용화 속도에 따라 해석이 달라질 수 있으므로 최신 자료 확인이 필요합니다.",
  ];

  return `<section class="content-enhancement" aria-label="콘텐츠 검토 정보">
      <h2>핵심 요약과 참고자료</h2>
      <div class="enhancement-grid">
        <div>
          <h3>핵심 요약</h3>
          <ul>
            ${summaryItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
        <div>
          <h3>검토 관점</h3>
          <ul>
            ${perspective.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      </div>
      <h3>공개 참고자료</h3>
      <ul class="source-list">
        ${sources
          .map(
            (source) => `<li><a href="${source.url}" rel="nofollow noopener" target="_blank">${escapeHtml(source.label)}</a><span>${escapeHtml(source.note)}</span></li>`,
          )
          .join("")}
      </ul>
    </section>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absoluteUrl(routePath = "/") {
  return `${site.url}${routePath === "/" ? "" : encodeURI(routePath)}`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(dateString));
}

function routeToFile(routePath) {
  const decoded = decodeURIComponent(routePath.split("?")[0]);
  const segments = decoded.split("/").filter(Boolean);
  return path.join(dist, ...segments, "index.html");
}

async function writeRoute(routePath, html) {
  const file = routeToFile(routePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
}

function navLink(routePath, label) {
  return `<a href="${encodeURI(routePath)}">${escapeHtml(label)}</a>`;
}

function layout({ title, description, routePath = "/", image = "", body, type = "website", extraHead = "" }) {
  const pageTitle = title === site.title ? site.title : `${title} | ${site.title}`;
  const canonical = absoluteUrl(routePath);
  const socialImage = image ? absoluteUrl(image) : "";
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.title,
    url: site.url,
    contactPoint: {
      "@type": "ContactPoint",
      email: "yoonezra@gmail.com",
      contactType: "editorial inquiries",
    },
  };

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description || site.description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="${escapeHtml(site.title)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description || site.description)}">
  <meta property="og:url" content="${canonical}">
  ${socialImage ? `<meta property="og:image" content="${socialImage}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/assets/style.css">
  <script type="application/ld+json">${JSON.stringify(organizationJsonLd)}</script>
  ${extraHead}
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/">
        <strong>${escapeHtml(site.title)}</strong>
        <span>Middle East business intelligence</span>
      </a>
      <nav class="nav" aria-label="주요 메뉴">
        ${navLink("/", "홈")}
        ${navLink("/category/energy/", "에너지 산업")}
        ${navLink("/about/", "소개")}
        ${navLink("/editorial-policy/", "편집 기준")}
        ${navLink("/contact/", "문의")}
      </nav>
    </div>
  </header>
  <main class="main">
${body}
  </main>
  <footer class="site-footer">
    <div class="footer-links">
      ${navLink("/about/", "사이트 소개")}
      ${navLink("/privacy-policy/", "개인정보처리방침")}
      ${navLink("/terms/", "이용약관")}
      ${navLink("/editorial-policy/", "편집 기준")}
      ${navLink("/contact/", "문의")}
    </div>
    <p>© ${new Date().getFullYear()} omybusiness. 중동 비즈니스와 에너지 산업 정보를 정리하는 독립 정보 사이트입니다.</p>
  </footer>
</body>
</html>`;
}

function postCard(post) {
  return `<article class="post-card" data-title="${escapeHtml(post.title.toLowerCase())}">
  <a href="${encodeURI(post.routePath)}">
    ${post.image ? `<img src="${post.image}" alt="${escapeHtml(post.title)}" loading="lazy">` : ""}
    <div class="post-card-body">
      <div class="meta"><span>${escapeHtml(formatDate(post.publishedAt))}</span><span class="pill">${escapeHtml(post.category)}</span></div>
      <h2>${escapeHtml(post.title)}</h2>
      <p>${escapeHtml(post.description)}</p>
    </div>
  </a>
</article>`;
}

function renderIndex(filteredPosts = posts, title = site.title, routePath = "/") {
  const body = `  <section class="intro">
    <p class="eyebrow">Middle East Business Archive</p>
    <h1>${escapeHtml(site.title)}</h1>
    <p>${escapeHtml(site.description)}</p>
  </section>
  <section class="trust-strip" aria-label="사이트 운영 기준">
    <div><strong>${posts.length}</strong><span>분석 글</span></div>
    <div><strong>광고 정리</strong><span>승인 전 광고 잔재 제거</span></div>
    <div><strong>출처 중심</strong><span>산업 자료 기반 정리</span></div>
  </section>
  <section>
    <div class="toolbar">
      <input class="search" id="postSearch" type="search" placeholder="글 검색" aria-label="글 검색">
      <span class="count">전체 ${filteredPosts.length}개 글</span>
    </div>
    <div class="post-grid" id="postGrid">
      ${filteredPosts.map(postCard).join("\n")}
    </div>
  </section>
  <script>
    const input = document.getElementById("postSearch");
    const cards = [...document.querySelectorAll(".post-card")];
    input?.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      cards.forEach((card) => {
        card.hidden = query && !card.dataset.title.includes(query);
      });
    });
  </script>`;

  return layout({ title, description: site.description, routePath, body });
}

function renderPost(post, index) {
  const previous = posts[index + 1];
  const next = posts[index - 1];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url: absoluteUrl(post.routePath),
    datePublished: post.publishedAt,
    dateModified: post.modifiedAt || post.publishedAt,
    author: { "@type": "Organization", name: site.title, url: site.url },
    publisher: { "@type": "Organization", name: site.title, url: site.url },
    image: post.image ? absoluteUrl(post.image) : undefined,
    inLanguage: "ko-KR",
  };

  const body = `  <article class="article">
    <header class="article-header">
      <div class="meta"><span>${escapeHtml(formatDate(post.publishedAt))}</span><span class="pill">${escapeHtml(post.category)}</span></div>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="article-description">${escapeHtml(post.description)}</p>
    </header>
    <aside class="editor-note">
      <strong>편집 기준</strong>
      <p>이 글은 중동 비즈니스와 에너지 산업 흐름을 이해하기 쉽도록 정리한 정보 콘텐츠입니다. 광고와 본문은 분리해 운영하며, 오류가 확인되면 보완합니다.</p>
    </aside>
    <div class="entry-content">
      ${post.content}
    </div>
    ${renderArticleEnhancement(post, index)}
    <nav class="article-nav" aria-label="글 이동">
      <span>${previous ? `<a href="${encodeURI(previous.routePath)}">이전 글: ${escapeHtml(previous.title)}</a>` : ""}</span>
      <span>${next ? `<a href="${encodeURI(next.routePath)}">다음 글: ${escapeHtml(next.title)}</a>` : ""}</span>
    </nav>
  </article>`;

  return layout({
    title: post.title,
    description: post.description,
    routePath: post.routePath,
    image: post.image,
    type: "article",
    body,
    extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  });
}

function renderPage(page) {
  const body = `  <article class="page">
    <header class="page-header">
      <h1>${escapeHtml(page.title)}</h1>
      <p class="article-description">${escapeHtml(page.description)}</p>
    </header>
    <div class="entry-content">
      ${page.content}
    </div>
  </article>`;
  return layout({ title: page.title, description: page.description, routePath: page.routePath, body });
}

function renderSitemap() {
  const items = [
    { routePath: "/", modifiedAt: site.migratedAt },
    ...trustPages,
    ...posts,
    { routePath: "/category/energy/", modifiedAt: site.migratedAt },
    { routePath: "/tag/", modifiedAt: site.migratedAt },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items
  .map(
    (item) => `  <url>
    <loc>${absoluteUrl(item.routePath)}</loc>
    ${item.modifiedAt ? `<lastmod>${new Date(item.modifiedAt).toISOString()}</lastmod>` : ""}
  </url>`,
  )
  .join("\n")}
</urlset>
`;
}

function renderRss() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(site.title)}</title>
    <link>${site.url}</link>
    <description>${escapeHtml(site.description)}</description>
    <language>ko</language>
    ${posts
      .slice(0, 30)
      .map(
        (post) => `<item>
      <title>${escapeHtml(post.title)}</title>
      <link>${absoluteUrl(post.routePath)}</link>
      <description>${escapeHtml(post.description)}</description>
      <category>${escapeHtml(post.category)}</category>
      <guid isPermaLink="true">${absoluteUrl(post.routePath)}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
    </item>`,
      )
      .join("\n")}
  </channel>
</rss>
`;
}

function renderRedirects() {
  const lines = posts.flatMap((post) => {
    const rows = [];
    if (post.numericPath) rows.push(`${post.numericPath} ${encodeURI(post.routePath)} 301`);
    rows.push(`/m${encodeURI(post.routePath)} ${encodeURI(post.routePath)} 301`);
    return rows;
  });
  lines.push("/pages/%EC%82%AC%EC%9D%B4%ED%8A%B8-%EC%86%8C%EA%B0%9C /about/ 301");
  lines.push("/category/%ED%9A%8C%EC%82%AC/ /category/energy/ 301");
  lines.push("/rss.xml /rss.xml 200");
  return `${lines.join("\n")}\n`;
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });
await cp(path.join(root, "public"), dist, { recursive: true, force: true });
await cp(path.join(root, "src", "styles.css"), path.join(dist, "assets", "style.css"));

await writeRoute("/", renderIndex());
await writeRoute("/category/energy/", renderIndex(posts, "에너지 산업", "/category/energy/"));
await writeRoute("/tag/", renderIndex(posts, "태그", "/tag/"));

for (const [index, post] of posts.entries()) {
  await writeRoute(post.routePath, renderPost(post, index));
}

for (const page of trustPages) {
  await writeRoute(page.routePath, renderPage(page));
}

await writeFile(path.join(dist, "sitemap.xml"), renderSitemap());
await writeFile(path.join(dist, "rss.xml"), renderRss());
await writeFile(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
await writeFile(path.join(dist, "_redirects"), renderRedirects());
await writeFile(
  path.join(dist, "404.html"),
  layout({
    title: "페이지를 찾을 수 없습니다",
    description: site.description,
    body: `  <section class="intro"><h1>페이지를 찾을 수 없습니다</h1><p><a href="/">홈으로 이동</a></p></section>`,
  }),
);

console.log(`Built ${posts.length} posts and ${trustPages.length} trust pages into dist/.`);
