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
const reviewUpdatedAt = "2026-07-13T09:45:00+09:00";

const topicHubs = [
  {
    title: "디지털 전환과 에너지 AI",
    routePath: "/topics/digital-energy-ai/",
    description:
      "사우디아람코의 AI, 디지털 트윈, 데이터 인프라, 자동화 기술을 에너지 산업 운영 관점에서 묶어 읽는 주제 허브입니다.",
    keywords: /AI|언어모델|디지털|데이터|알고리즘|자동화|센서|블록체인|보안|무선|가스 감지/,
    points: [
      "탐사와 생산 영역에서 데이터 해석 속도가 어떤 경쟁력으로 이어지는지 살펴봅니다.",
      "디지털 전환이 비용 절감뿐 아니라 안전, 정비, 공급망 안정성과 어떻게 연결되는지 정리합니다.",
      "개별 기술 뉴스를 기업 운영 전략과 산업 표준 변화라는 큰 흐름 안에서 읽도록 돕습니다.",
    ],
  },
  {
    title: "저탄소 전환과 지속가능 에너지",
    routePath: "/topics/low-carbon-transition/",
    description:
      "수소, 블루 암모니아, 바이오 연료, 탄소포집, 환경 복원 등 에너지 전환 관련 글을 모은 분석 허브입니다.",
    keywords: /수소|암모니아|바이오|탄소|친환경|지속|재생|태양광|망그로브|해양|복원|연료 혼합/,
    points: [
      "에너지 전환 기술을 선언이 아니라 생산, 운송, 수요처, 정책 리스크의 조합으로 해석합니다.",
      "저탄소 프로젝트가 실제 사업성이 생기기 위해 필요한 인프라와 파트너십을 함께 봅니다.",
      "환경·사회적 성과와 기업 경쟁력 사이의 연결 지점을 독자가 판단할 수 있도록 정리합니다.",
    ],
  },
  {
    title: "석유화학과 소재 밸류체인",
    routePath: "/topics/chemicals-materials/",
    description:
      "석유화학, 윤활유, 탄소섬유, 비금속 소재, 정제·화학 전환 전략을 공급망 관점에서 묶은 주제 허브입니다.",
    keywords: /화학|석유화학|윤활유|탄소 섬유|비금속|소재|정제|항공유|액체 연료|촉매|폴리머/,
    points: [
      "원유 생산 기업이 왜 화학·소재 영역으로 확장하는지 수요 구조와 마진 관점에서 설명합니다.",
      "다운스트림 투자가 단기 시황보다 장기 밸류체인 장악력과 어떻게 연결되는지 살펴봅니다.",
      "소재 기술, 정제 효율, 제품 품질 관리가 산업 경쟁력에 주는 영향을 비교해 읽습니다.",
    ],
  },
  {
    title: "탐사·생산과 공급망 전략",
    routePath: "/topics/upstream-supply-chain/",
    description:
      "탐사, 생산 비용, 셰일 가스, 공급망 국산화, 아시아 수출 전략 등 에너지 기업의 운영 기반을 다루는 글 모음입니다.",
    keywords: /탐사|생산|셰일|가스전|원유|시추|공급망|국산화|수출|아시아|유전|저류|비용/,
    points: [
      "상류부문 기술과 생산 효율이 에너지 안보와 기업 수익성에 주는 의미를 연결합니다.",
      "공급망 현지화와 해외 수출 전략을 단순 지역 뉴스가 아닌 산업 정책 흐름으로 해석합니다.",
      "원가, 설비, 파트너십, 장기 수요라는 네 가지 축에서 운영 전략을 비교할 수 있게 구성합니다.",
    ],
  },
];

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

function getArticlePerspective(title = "") {
  if (/AI|언어모델|디지털|데이터|알고리즘|자동화|센서|블록체인|보안|무선|감지/.test(title)) {
    return {
      why: "이 주제는 에너지 기업이 보유한 현장 데이터와 운영 노하우를 어떻게 생산성, 안전, 비용 관리로 전환하는지를 보여줍니다.",
      check: "기술 명칭보다 실제 적용 위치, 데이터 품질, 현장 운영자의 의사결정 변화가 함께 설명되는지 확인하면 글의 가치를 더 잘 판단할 수 있습니다.",
      signal: "디지털 기술은 단독 제품보다 기존 설비와 결합될 때 효과가 커지므로, 관련 투자와 파트너십 흐름을 함께 보는 것이 좋습니다.",
    };
  }

  if (/수소|암모니아|바이오|탄소|친환경|지속|재생|태양광|망그로브|해양|복원/.test(title)) {
    return {
      why: "이 주제는 전통 에너지 기업이 탄소 배출, 규제, 장기 수요 변화에 대응하는 방식을 읽는 데 도움이 됩니다.",
      check: "프로젝트 발표만 볼 것이 아니라 생산 단가, 운송 인프라, 수요처 확보, 정책 지원 여부를 함께 확인해야 합니다.",
      signal: "저탄소 전환은 기술 개발과 시장 형성이 동시에 진행되는 영역이라 단기 성과보다 반복 투자와 공급망 구축 여부가 중요합니다.",
    };
  }

  if (/화학|석유화학|윤활유|탄소 섬유|비금속|소재|정제|항공유|액체 연료|촉매|폴리머/.test(title)) {
    return {
      why: "이 주제는 원유 중심 기업이 고부가가치 제품과 소재 밸류체인으로 확장하는 이유를 이해하는 데 유용합니다.",
      check: "제품 수요, 정제·화학 통합도, 원료 조달, 브랜드·유통망이 함께 연결되어 있는지 살펴보면 산업적 의미가 분명해집니다.",
      signal: "석유화학과 소재 전략은 경기 변동의 영향을 받지만, 장기적으로는 자동차·항공·제조업의 소재 전환과 맞물립니다.",
    };
  }

  return {
    why: "이 주제는 사우디아람코의 운영 방식과 중동 에너지 산업의 구조 변화를 함께 이해하는 데 필요한 배경을 제공합니다.",
    check: "개별 사례를 볼 때는 기업 발표, 연차보고서, 기술 적용 범위, 시장 수요를 함께 확인하는 것이 좋습니다.",
    signal: "에너지 산업은 유가, 규제, 기술 상용화 속도에 따라 해석이 달라지므로 최신 공개 자료와 함께 읽어야 합니다.",
  };
}

function getRelatedPosts(post) {
  const tokens = new Set(
    post.title
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 2),
  );

  return posts
    .filter((candidate) => candidate.routePath !== post.routePath)
    .map((candidate) => {
      const score = candidate.title
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((token) => tokens.has(token)).length;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score || new Date(b.candidate.publishedAt) - new Date(a.candidate.publishedAt))
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

function renderArticleEnhancement(post) {
  const summaryItems = summarizeDescription(post.description);
  const sources = getArticleSources(post.title);
  const perspective = getArticlePerspective(post.title);
  const relatedPosts = getRelatedPosts(post);

  return `<section class="content-enhancement" aria-label="콘텐츠 검토 정보">
      <h2>핵심 요약과 독자 가치</h2>
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
            <li>${escapeHtml(perspective.why)}</li>
            <li>${escapeHtml(perspective.check)}</li>
            <li>${escapeHtml(perspective.signal)}</li>
          </ul>
        </div>
      </div>
      <div class="reader-value">
        <h3>이 글을 읽을 때 볼 지점</h3>
        <p>단일 기업 뉴스로만 보기보다 기술 적용 범위, 투자 지속성, 공급망 변화, 규제 환경을 함께 보면 중동 에너지 산업의 구조적 변화를 더 명확하게 읽을 수 있습니다.</p>
      </div>
      <h3>공개 참고자료</h3>
      <ul class="source-list">
        ${sources
          .map(
            (source) => `<li><a href="${source.url}" rel="nofollow noopener" target="_blank">${escapeHtml(source.label)}</a><span>${escapeHtml(source.note)}</span></li>`,
          )
          .join("")}
      </ul>
      <h3>함께 읽으면 좋은 글</h3>
      <ul class="source-list related-list">
        ${relatedPosts
          .map((related) => `<li><a href="${encodeURI(related.routePath)}">${escapeHtml(related.title)}</a><span>${escapeHtml(related.description)}</span></li>`)
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
        ${navLink("/topics/", "주제별")}
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
      ${navLink("/topics/", "주제별 허브")}
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

function getHubPosts(hub) {
  return posts.filter((post) => hub.keywords.test(post.title)).slice(0, 18);
}

function topicCard(hub) {
  const hubPosts = getHubPosts(hub);
  return `<article class="topic-card">
    <a href="${encodeURI(hub.routePath)}">
      <span>${hubPosts.length}개 글</span>
      <h2>${escapeHtml(hub.title)}</h2>
      <p>${escapeHtml(hub.description)}</p>
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
    <div><strong>광고·본문 분리</strong><span>독자가 먼저 읽는 정보 구조</span></div>
    <div><strong>출처 중심</strong><span>공식 자료와 산업 맥락 기반 정리</span></div>
  </section>
  <section class="value-panel" aria-label="사이트 가치">
    <div>
      <h2>왜 이 사이트를 따로 읽을 만한가</h2>
      <p>omybusiness는 사우디아람코와 중동 에너지 산업 이슈를 단순 뉴스 요약으로 처리하지 않고, 기술 적용 범위·공급망 변화·저탄소 전환·시장 전략이라는 네 가지 관점으로 다시 묶어 설명합니다.</p>
    </div>
    <ul>
      <li>전문 용어를 그대로 나열하지 않고 산업 의사결정에 주는 의미를 함께 정리합니다.</li>
      <li>각 글 하단에 검토 관점, 공개 참고자료, 관련 글을 배치해 추가 탐색이 가능하게 구성했습니다.</li>
      <li>광고 배치보다 본문 가독성, 신뢰 페이지, 명확한 연락 경로를 우선합니다.</li>
    </ul>
  </section>
  <section class="topic-section" aria-label="주제별 탐색">
    <div class="section-heading">
      <h2>주제별로 이어 읽기</h2>
      <a href="/topics/">전체 주제 보기</a>
    </div>
    <div class="topic-grid">
      ${topicHubs.map(topicCard).join("\n")}
    </div>
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

function renderTopicsIndex() {
  const body = `  <section class="intro">
    <p class="eyebrow">Topic Guide</p>
    <h1>주제별 분석 허브</h1>
    <p>비슷한 글을 단순 목록으로 두지 않고, 에너지 AI, 저탄소 전환, 석유화학·소재, 탐사·공급망이라는 흐름으로 묶어 읽을 수 있도록 정리했습니다.</p>
  </section>
  <section class="topic-grid">
    ${topicHubs.map(topicCard).join("\n")}
  </section>`;

  return layout({
    title: "주제별 분석 허브",
    description: "omybusiness의 사우디아람코 및 중동 에너지 산업 글을 주제별로 묶은 탐색 페이지입니다.",
    routePath: "/topics/",
    body,
  });
}

function renderTopicHub(hub) {
  const hubPosts = getHubPosts(hub);
  const body = `  <section class="intro">
    <p class="eyebrow">Topic Guide</p>
    <h1>${escapeHtml(hub.title)}</h1>
    <p>${escapeHtml(hub.description)}</p>
  </section>
  <section class="value-panel">
    <div>
      <h2>이 주제를 보는 기준</h2>
      <p>아래 글들은 같은 기업을 다루더라도 기술, 시장, 공급망, 정책 리스크가 서로 다르게 연결됩니다. 먼저 기준을 잡고 읽으면 단편적인 뉴스보다 산업 구조를 파악하는 데 도움이 됩니다.</p>
    </div>
    <ul>
      ${hub.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
    </ul>
  </section>
  <section>
    <div class="section-heading">
      <h2>관련 글</h2>
      <span>${hubPosts.length}개 글</span>
    </div>
    <div class="post-grid">
      ${hubPosts.map(postCard).join("\n")}
    </div>
  </section>`;

  return layout({
    title: hub.title,
    description: hub.description,
    routePath: hub.routePath,
    body,
  });
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
    { routePath: "/", modifiedAt: reviewUpdatedAt },
    ...trustPages,
    ...posts.map((post) => ({ ...post, modifiedAt: reviewUpdatedAt })),
    { routePath: "/category/energy/", modifiedAt: reviewUpdatedAt },
    { routePath: "/tag/", modifiedAt: reviewUpdatedAt },
    { routePath: "/topics/", modifiedAt: reviewUpdatedAt },
    ...topicHubs.map((hub) => ({ ...hub, modifiedAt: reviewUpdatedAt })),
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
await writeRoute("/topics/", renderTopicsIndex());

for (const hub of topicHubs) {
  await writeRoute(hub.routePath, renderTopicHub(hub));
}

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
