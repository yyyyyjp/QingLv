import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const configDir = join(projectDir, "configs");
const outputDir = join(projectDir, "dist");
const siteConfig = readJson(join(projectDir, "qinglv.config.json"));
const perPage = normalizePerPage(siteConfig.perPage);
const fileExtensionWhitelist = new Set([".txt"]);
const locale = typeof siteConfig.locale === "string" ? siteConfig.locale : "zh-CN";
const timeZone = typeof siteConfig.timeZone === "string" ? siteConfig.timeZone : "Asia/Shanghai";
const importParamMode = siteConfig.importParamMode === "file-url" ? "file-url" : "filename";
const gameBaseUrl =
  typeof siteConfig.gameBaseUrl === "string" && siteConfig.gameBaseUrl.trim().length > 0
    ? siteConfig.gameBaseUrl.trim()
    : "https://lovegame.hoothin.com/ludo";
const siteTitle =
  typeof siteConfig.siteTitle === "string" && siteConfig.siteTitle.trim().length > 0
    ? siteConfig.siteTitle.trim()
    : "情侣飞行棋配置库";
const siteDescription =
  typeof siteConfig.siteDescription === "string" && siteConfig.siteDescription.trim().length > 0
    ? siteConfig.siteDescription.trim()
    : "上传配置文件后自动生成的分页索引页。";
const siteBaseUrl = resolveSiteBaseUrl();

buildSite();

function buildSite() {
  const configFiles = collectConfigFiles(configDir)
    .filter(filePath => fileExtensionWhitelist.has(extname(filePath).toLowerCase()))
    .map(createConfigEntry)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.relativePath.localeCompare(right.relativePath));

  resetOutputDirectory();
  writeStaticAssets();
  copyConfigs(configFiles);
  writePaginatedPages(configFiles);
}

function collectConfigFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const results = [];
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectConfigFiles(fullPath));
      continue;
    }

    results.push(fullPath);
  }

  return results;
}

function createConfigEntry(filePath) {
  const relativePath = toPosixPath(relative(projectDir, filePath));
  const relativeConfigPath = toPosixPath(relative(configDir, filePath));
  const fileStat = statSync(filePath);
  const updatedAt = readGitTimestamp(relativePath) ?? fileStat.mtimeMs;
  const content = readFileSync(filePath, "utf8");
  const importValue = importParamMode === "file-url" ? buildPublicConfigUrl(relativeConfigPath) : relativeConfigPath;

  return {
    absolutePath: filePath,
    relativePath,
    relativeConfigPath,
    displayName: prettifyName(relativeConfigPath),
    importUrl: buildImportUrl(importValue),
    rawUrl: `./configs/${encodePath(relativeConfigPath)}`,
    updatedAt,
    updatedLabel: formatDate(updatedAt),
    sizeLabel: formatFileSize(fileStat.size),
    summary: extractSummary(content)
  };
}

function resetOutputDirectory() {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, "configs"), { recursive: true });
}

function writeStaticAssets() {
  writeFileSync(join(outputDir, "styles.css"), buildStyles(), "utf8");
  writeFileSync(join(outputDir, "app.js"), buildClientScript(), "utf8");
}

function copyConfigs(entries) {
  for (const entry of entries) {
    const targetPath = join(outputDir, "configs", ...entry.relativeConfigPath.split("/"));
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(entry.absolutePath, targetPath);
  }
}

function writePaginatedPages(entries) {
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const pageEntries = entries.slice((pageNumber - 1) * perPage, pageNumber * perPage);
    const targetDirectory = pageNumber === 1 ? outputDir : join(outputDir, "page", String(pageNumber));
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(
      join(targetDirectory, "index.html"),
      buildPageHtml({
        entries: pageEntries,
        currentPage: pageNumber,
        totalPages,
        totalCount: entries.length
      }),
      "utf8"
    );
  }

  writeFileSync(join(outputDir, "404.html"), buildPageHtml({
    entries: entries.slice(0, perPage),
    currentPage: 1,
    totalPages,
    totalCount: entries.length
  }), "utf8");
}

function buildPageHtml({ entries, currentPage, totalPages, totalCount }) {
  const rootPrefix = currentPage === 1 ? "./" : "../../";
  const cardsHtml = entries.length > 0
    ? entries.map(entry => buildCard(entry, rootPrefix)).join("\n")
    : `
      <section class="empty-state">
        <p class="empty-kicker">暂无配置</p>
        <h2>把你的第一个 <code>.txt</code> 文件放进 <code>configs/</code></h2>
        <p>推送到 GitHub 后，这里会自动生成新的可导入卡片。</p>
      </section>
    `;

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(siteTitle)}${currentPage > 1 ? ` - 第 ${currentPage} 页` : ""}</title>
    <meta name="description" content="${escapeHtml(siteDescription)}" />
    <link rel="stylesheet" href="${rootPrefix}styles.css" />
  </head>
  <body>
    <div class="page-shell">
      <div class="hero-glow hero-glow-left"></div>
      <div class="hero-glow hero-glow-right"></div>
      <main class="layout">
        <section class="hero-card">
          <p class="hero-kicker">QingLv Config Gallery</p>
          <h1>${escapeHtml(siteTitle)}</h1>
          <p class="hero-description">${escapeHtml(siteDescription)}</p>
          <div class="hero-metrics">
            <div class="metric">
              <span class="metric-label">配置数量</span>
              <strong>${totalCount}</strong>
            </div>
            <div class="metric">
              <span class="metric-label">排序方式</span>
              <strong>最近更新优先</strong>
            </div>
            <div class="metric">
              <span class="metric-label">当前页</span>
              <strong>${currentPage} / ${totalPages}</strong>
            </div>
          </div>
        </section>

        <section class="grid">
          ${cardsHtml}
        </section>

        ${buildPagination(currentPage, totalPages, rootPrefix)}
      </main>
    </div>
    <script src="${rootPrefix}app.js"></script>
  </body>
</html>`;
}

function buildCard(entry, rootPrefix) {
  return `
    <article class="config-card" data-href="${escapeHtml(entry.importUrl)}" tabindex="0" role="link" aria-label="导入 ${escapeHtml(entry.displayName)}">
      <div class="card-topline">
        <span class="pill">TXT</span>
        <span class="update-time">${escapeHtml(entry.updatedLabel)}</span>
      </div>
      <h2>${escapeHtml(entry.displayName)}</h2>
      <p class="summary">${escapeHtml(entry.summary)}</p>
      <dl class="meta-list">
        <div>
          <dt>文件路径</dt>
          <dd>${escapeHtml(entry.relativeConfigPath)}</dd>
        </div>
        <div>
          <dt>文件大小</dt>
          <dd>${escapeHtml(entry.sizeLabel)}</dd>
        </div>
      </dl>
      <div class="card-actions">
        <a class="primary-link" href="${escapeHtml(entry.importUrl)}">立即导入</a>
        <a class="secondary-link" href="${escapeHtml(`${rootPrefix}configs/${encodePath(entry.relativeConfigPath)}`)}" target="_blank" rel="noreferrer noopener">查看原文件</a>
      </div>
    </article>
  `;
}

function buildPagination(currentPage, totalPages, rootPrefix) {
  if (totalPages <= 1) {
    return "";
  }

  const items = [];

  if (currentPage > 1) {
    items.push(`<a class="page-nav" href="${pageHref(currentPage - 1, rootPrefix)}">上一页</a>`);
  } else {
    items.push(`<span class="page-nav disabled">上一页</span>`);
  }

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    items.push(
      pageNumber === currentPage
        ? `<span class="page-number active">${pageNumber}</span>`
        : `<a class="page-number" href="${pageHref(pageNumber, rootPrefix)}">${pageNumber}</a>`
    );
  }

  if (currentPage < totalPages) {
    items.push(`<a class="page-nav" href="${pageHref(currentPage + 1, rootPrefix)}">下一页</a>`);
  } else {
    items.push(`<span class="page-nav disabled">下一页</span>`);
  }

  return `<nav class="pagination" aria-label="分页导航">${items.join("")}</nav>`;
}

function pageHref(pageNumber, rootPrefix) {
  if (pageNumber === 1) {
    return rootPrefix;
  }

  return `${rootPrefix}page/${pageNumber}/`;
}

function buildImportUrl(importValue) {
  const url = new URL(gameBaseUrl);
  url.searchParams.set("import", importValue);
  return url.toString();
}

function resolveSiteBaseUrl() {
  const fromEnv = typeof process.env.SITE_BASE_URL === "string" ? process.env.SITE_BASE_URL.trim() : "";
  if (fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, "");
  }

  const repository = typeof process.env.GITHUB_REPOSITORY === "string" ? process.env.GITHUB_REPOSITORY.trim() : "";
  const pagesServerUrl = typeof process.env.GITHUB_PAGES_URL === "string" ? process.env.GITHUB_PAGES_URL.trim() : "";
  if (pagesServerUrl.length > 0) {
    return pagesServerUrl.replace(/\/+$/, "");
  }

  if (!repository.includes("/")) {
    return "";
  }

  const [owner, repo] = repository.split("/");
  return `https://${owner}.github.io/${repo}`;
}

function buildPublicConfigUrl(relativeConfigPath) {
  const encodedPath = encodePath(relativeConfigPath);
  if (siteBaseUrl.length === 0) {
    return `./configs/${encodedPath}`;
  }
  return `${siteBaseUrl}/configs/${encodedPath}`;
}

function encodePath(value) {
  return value
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");
}

function prettifyName(relativeConfigPath) {
  const cleanPath = relativeConfigPath.replace(/\.txt$/i, "");
  const segments = cleanPath.split("/");
  return segments[segments.length - 1].replace(/[-_]+/g, " ");
}

function extractSummary(content) {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "点击卡片即可跳转导入这个配置。";
  }

  const firstLine = lines[0];
  if (firstLine.length > 90 || /^[{\[]/.test(firstLine) || /^[A-Za-z0-9+/=]{40,}$/.test(firstLine)) {
    return "点击卡片即可跳转导入这个配置。";
  }

  return firstLine;
}

function readGitTimestamp(relativePath) {
  try {
    const output = execFileSync(
      "git",
      ["-c", `safe.directory=${projectDir}`, "-C", projectDir, "log", "-1", "--format=%ct", "--", relativePath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();

    if (!output) {
      return null;
    }

    const timestamp = Number(output);
    return Number.isFinite(timestamp) ? timestamp * 1000 : null;
  } catch {
    return null;
  }
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(timestamp));
}

function formatFileSize(size) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizePerPage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 12;
  }
  return Math.floor(parsed);
}

function toPosixPath(filePath) {
  return filePath.split(sep).join("/");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildClientScript() {
  return `const cards = document.querySelectorAll("[data-href]");

for (const card of cards) {
  card.addEventListener("click", event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("a")) {
      return;
    }

    const href = card.getAttribute("data-href");
    if (href) {
      window.location.href = href;
    }
  });

  card.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    const href = card.getAttribute("data-href");
    if (href) {
      window.location.href = href;
    }
  });
}
`;
}

function buildStyles() {
  return `:root {
  color-scheme: light;
  --bg: #f7efe8;
  --bg-accent: #fff8f1;
  --panel: rgba(255, 250, 245, 0.82);
  --panel-strong: rgba(255, 248, 240, 0.94);
  --text: #3b1f1f;
  --muted: #7b5b57;
  --border: rgba(103, 57, 50, 0.14);
  --shadow: 0 30px 80px rgba(123, 63, 51, 0.16);
  --primary: #b84f4f;
  --primary-strong: #8f2f3a;
  --accent: #f4bf72;
  --success: #3d7d5d;
}

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--text);
  background:
    radial-gradient(circle at top left, rgba(255, 216, 190, 0.9), transparent 28%),
    radial-gradient(circle at top right, rgba(255, 186, 161, 0.55), transparent 24%),
    linear-gradient(180deg, var(--bg-accent), var(--bg));
}

a {
  color: inherit;
  text-decoration: none;
}

code {
  padding: 0.16rem 0.42rem;
  border-radius: 999px;
  background: rgba(184, 79, 79, 0.12);
  font-family: "Cascadia Code", "Consolas", monospace;
}

.page-shell {
  position: relative;
  overflow: hidden;
}

.hero-glow {
  position: fixed;
  inset: auto;
  width: 22rem;
  height: 22rem;
  border-radius: 999px;
  filter: blur(30px);
  opacity: 0.4;
  pointer-events: none;
}

.hero-glow-left {
  top: -6rem;
  left: -4rem;
  background: rgba(244, 191, 114, 0.45);
}

.hero-glow-right {
  right: -5rem;
  top: 8rem;
  background: rgba(184, 79, 79, 0.22);
}

.layout {
  position: relative;
  z-index: 1;
  width: min(1120px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 3rem 0 4rem;
}

.hero-card {
  position: relative;
  padding: 2rem;
  border: 1px solid var(--border);
  border-radius: 2rem;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 246, 238, 0.88)),
    var(--panel);
  box-shadow: var(--shadow);
  backdrop-filter: blur(14px);
}

.hero-card::after {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: calc(2rem - 1px);
  border: 1px solid rgba(255, 255, 255, 0.55);
  pointer-events: none;
}

.hero-kicker {
  margin: 0 0 0.9rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-size: 0.78rem;
  color: var(--primary-strong);
}

.hero-card h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.6rem);
  line-height: 1.02;
}

.hero-description {
  max-width: 46rem;
  margin: 1rem 0 0;
  font-size: 1.05rem;
  line-height: 1.8;
  color: var(--muted);
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.75rem;
}

.metric {
  padding: 1rem 1.1rem;
  border-radius: 1.2rem;
  background: rgba(255, 255, 255, 0.64);
  border: 1px solid rgba(184, 79, 79, 0.12);
}

.metric-label {
  display: block;
  font-size: 0.85rem;
  color: var(--muted);
}

.metric strong {
  display: block;
  margin-top: 0.4rem;
  font-size: 1.15rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.2rem;
  margin-top: 1.5rem;
}

.config-card,
.empty-state {
  position: relative;
  padding: 1.35rem;
  border-radius: 1.6rem;
  border: 1px solid var(--border);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 248, 242, 0.84)),
    var(--panel-strong);
  box-shadow: 0 18px 50px rgba(123, 63, 51, 0.1);
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

.config-card {
  cursor: pointer;
  outline: none;
}

.config-card:hover,
.config-card:focus-visible {
  transform: translateY(-4px);
  border-color: rgba(184, 79, 79, 0.3);
  box-shadow: 0 24px 56px rgba(123, 63, 51, 0.16);
}

.card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3rem;
  padding: 0.34rem 0.68rem;
  border-radius: 999px;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: white;
  background: linear-gradient(135deg, var(--primary), var(--primary-strong));
}

.update-time {
  font-size: 0.82rem;
  color: var(--muted);
}

.config-card h2 {
  margin: 1rem 0 0;
  font-size: 1.3rem;
  line-height: 1.25;
}

.summary {
  min-height: 3.4rem;
  margin: 0.85rem 0 0;
  color: var(--muted);
  line-height: 1.7;
}

.meta-list {
  display: grid;
  gap: 0.7rem;
  margin: 1rem 0 0;
}

.meta-list div {
  padding: 0.85rem 0.95rem;
  border-radius: 1rem;
  background: rgba(184, 79, 79, 0.06);
}

.meta-list dt {
  font-size: 0.78rem;
  color: var(--muted);
}

.meta-list dd {
  margin: 0.25rem 0 0;
  line-height: 1.55;
  word-break: break-all;
}

.card-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.1rem;
}

.primary-link,
.secondary-link,
.page-nav,
.page-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.9rem;
  padding: 0.7rem 1rem;
  border-radius: 999px;
  transition: transform 160ms ease, background-color 160ms ease, color 160ms ease, border-color 160ms ease;
}

.primary-link {
  flex: 1 1 auto;
  color: white;
  background: linear-gradient(135deg, var(--primary), var(--primary-strong));
}

.primary-link:hover,
.page-nav:hover,
.page-number:hover {
  transform: translateY(-1px);
}

.secondary-link,
.page-nav,
.page-number {
  border: 1px solid rgba(184, 79, 79, 0.18);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text);
}

.pagination {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  justify-content: center;
  margin-top: 1.75rem;
}

.page-number.active {
  color: white;
  border-color: transparent;
  background: linear-gradient(135deg, var(--primary), var(--primary-strong));
}

.disabled {
  opacity: 0.45;
  pointer-events: none;
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem 1.5rem;
}

.empty-kicker {
  margin: 0;
  color: var(--success);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 0.82rem;
}

.empty-state h2 {
  margin: 1rem 0 0;
  font-size: 1.8rem;
}

.empty-state p:last-child {
  margin: 0.9rem auto 0;
  max-width: 34rem;
  line-height: 1.75;
  color: var(--muted);
}

@media (max-width: 980px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero-metrics {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .layout {
    width: min(100% - 1rem, 100%);
    padding-top: 1rem;
  }

  .hero-card {
    padding: 1.35rem;
    border-radius: 1.5rem;
  }

  .grid {
    grid-template-columns: 1fr;
  }

  .card-actions {
    flex-direction: column;
  }

  .pagination {
    justify-content: flex-start;
  }
}
`;
}
