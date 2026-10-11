import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const posts = JSON.parse(await readFile(path.join(root, "data/posts.json"), "utf8"));
const catalog = JSON.parse(await readFile(path.join(root, "data/article-catalog.json"), "utf8"));
const reviewed = new Set(JSON.parse(await readFile(path.join(root, "data/article-reviews.json"), "utf8")).map(item => item.id));
const catalogById = new Map(catalog.map(item => [item.id, item]));
const experience = /(?:현장.{0,15}(?:방문|시찰|참여|느꼈|마주|경험)|직접 목격|제가 만난|항만 인근에서 근무|센터를 방문|싱가포르.{0,15}근무)/;
const specialChecks = new Map([
  ["51", "이스파(ispa) 명칭의 공식 자료와 실제 시스템 범위 확인"],
  ["12", "유전 명칭·표기, 자원량·생산량의 공식 원문 확인"],
  ["56", "탱크별 인증·운전 조건의 제조사 및 관할 근거 확인; 범용 운전법 제시 금지"],
  ["66", "검지 성능·시험 조건·오경보·안전 관리 근거 확인"],
  ["47", "재이용 목적별 수질 기준과 미확인 완전 제거·음용 적합 주장 확인"],
  ["73", "공개된 보안 범위와 미공개 내부 구성·무위험 주장 구분"],
]);
const rows = posts.filter(post => !reviewed.has(post.id)).map(post => {
  const dom = cheerio.load(post.content);
  dom("script,style").remove();
  const text = dom("body").text().replace(/\s+/g, " ").trim();
  const entry = catalogById.get(post.id);
  const experienceSnippets = dom("p").toArray().map(element => dom(element).text().trim()).filter(value => experience.test(value));
  return {
    id: post.id, title: post.title, url: `https://omybusiness.com${post.routePath}`,
    topic: entry.topic, proposedQuestion: entry.question, overlapGroup: entry.group || null,
    priority: specialChecks.has(post.id) || experienceSnippets.length ? "P0" : "P1",
    status: "본문 근거 검토 미완료",
    proposedAction: entry.group ? "근거 검증 후 질문별 범위 분리 또는 통합 후보 검토" : "근거 검증 후 개별 질문 중심으로 보강",
    nextEvidenceCheck: specialChecks.get(post.id) || "핵심 숫자·기업 적용·사업 단계의 1차 자료 연결",
    headings: dom("h2,h3").toArray().map(element => dom(element).text().trim()),
    experienceNeedsVerification: experienceSnippets.length > 0,
    experienceExamples: experienceSnippets.slice(0, 2).map(value => value.slice(0, 240)),
    externalLinks: dom("a[href]").toArray().map(element => dom(element).attr("href")).filter(value => /^https?:\/\//.test(value)),
    numberExamples: text.match(/.{0,25}\d+(?:\.\d+)?\s*(?:%|퍼센트|배|달러|톤).{0,35}/g)?.slice(0, 4) || [],
  };
});
const report = {
  date: "2026-10-12",
  scope: "70개 미개정 글의 제목·소제목·도입 검토와 19개 우선 묶음의 핵심 단락·표 표본 검토. 전수 사실 검증·표절 판정·최종 통합 결정이 아니다.",
  topics: [...new Set(catalog.map(entry => entry.topic))].map(topic => ({ topic, totalArticles: catalog.filter(entry => entry.topic === topic).length })),
  groups: [...new Set(catalog.map(entry => entry.group).filter(Boolean))].map(group => ({ group, ids: catalog.filter(entry => entry.group === group).map(entry => entry.id) })),
  rows,
};
const output = path.join(root, "docs/adsense-audit");
await writeFile(path.join(output, "phase-3-content-plan.json"), JSON.stringify(report, null, 2) + "\n");
const headers = ["id", "title", "url", "topic", "proposedQuestion", "overlapGroup", "priority", "status", "proposedAction", "nextEvidenceCheck", "experienceNeedsVerification"];
const cell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
await writeFile(path.join(output, "phase-3-content-plan.csv"), "\uFEFF" + [headers, ...rows.map(row => headers.map(header => row[header]))].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n");
console.log(JSON.stringify({ pendingArticles: rows.length, topics: report.topics, groups: report.groups, priorityCounts: { P0: rows.filter(row => row.priority === "P0").length, P1: rows.filter(row => row.priority === "P1").length } }, null, 2));
