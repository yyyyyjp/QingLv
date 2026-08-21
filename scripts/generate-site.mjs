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
import {
  DEFAULT_SORT,
  GALLERY_DATA_VERSION,
  SORT_OPTIONS,
  createSortOrders
} from "./gallery-model.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");
const configDir = join(projectDir, "configs");
const outputDir = join(projectDir, "dist");
const staticDir = join(scriptDir, "static");
const fileExtensionWhitelist = new Set([".txt", ".dat"]);
const staticAssetNames = Object.freeze(["styles.css", "app.js"]);

/**
 * 生成站点所需的标准化配置。
 *
 * @typedef {object} SiteSettings
 * @property {string} siteTitle 页面标题。
 * @property {string} siteDescription 页面说明。
 * @property {string} gameBaseUrl 游戏导入基础地址。
 * @property {"filename" | "file-url"} importParamMode 导入参数模式。
 * @property {number} perPage 每页展示数量。
 * @property {string} locale 日期和名称排序区域设置。
 * @property {string} timeZone 日期展示时区。
 * @property {string} siteBaseUrl GitHub Pages 站点根地址，可为空。
 */

/**
 * 单个配置文件对应的完整构建数据。
 *
 * @typedef {object} ConfigEntry
 * @property {string} id 配置唯一标识。
 * @property {string} absolutePath 配置文件绝对路径。
 * @property {string} relativePath 配置文件相对于仓库的路径。
 * @property {string} relativeConfigPath 配置文件相对于 configs 的路径。
 * @property {string} displayName 页面展示名称。
 * @property {string} extensionLabel 文件扩展名标签。
 * @property {string} importUrl 游戏导入地址。
 * @property {string} rawPath 原文件相对于站点根目录的地址。
 * @property {number} updatedAt 最近更新时间毫秒时间戳。
 * @property {string} updatedLabel 已格式化的更新时间。
 * @property {string} sizeLabel 已格式化的文件大小。
 * @property {string} summary 配置摘要。
 */

runBuild();

/**
 * 执行构建并统一处理未预期错误，确保 GitHub Actions 得到非零退出码。
 *
 * @returns {void}
 */
function runBuild() {
  try {
    const result = buildSite();
    console.log(
      "[QingLv] 已生成 " + result.entryCount + " 个配置、" + result.totalPages + " 个分页页面。"
    );
  } catch (error) {
    console.error("[QingLv] 静态站点生成失败：", getErrorMessage(error));
    process.exitCode = 1;
  }
}

/**
 * 收集配置、计算排序、写入静态页面和公共资源。
 *
 * @returns {{ entryCount: number, totalPages: number }} 构建统计信息。
 */
function buildSite() {
  const settings = readSiteSettings();
  const entries = collectConfigFiles(configDir)
    .filter(filePath => fileExtensionWhitelist.has(extname(filePath).toLowerCase()))
    .map(filePath => createConfigEntry(filePath, settings));
  const sortOrders = createSortOrders(entries, settings.locale);
  const defaultEntries = resolveOrderedEntries(entries, sortOrders[DEFAULT_SORT]);

  resetOutputDirectory();
  copyStaticAssets();
  copyConfigs(entries);
  writeGalleryData(entries, sortOrders, settings);
  const totalPages = writePaginatedPages(defaultEntries, settings);

  return {
    entryCount: entries.length,
    totalPages
  };
}

/**
 * 读取 qinglv.config.json 并把所有字段标准化为安全值。
 *
 * @returns {SiteSettings} 可直接用于构建的站点设置。
 */
function readSiteSettings() {
  const siteConfig = readJson(join(projectDir, "qinglv.config.json"));
  const requestedLocale = readNonEmptyString(siteConfig.locale, "zh-CN");
  const locale = normalizeLocale(requestedLocale);
  const requestedTimeZone = readNonEmptyString(siteConfig.timeZone, "Asia/Shanghai");

  return {
    siteTitle: readNonEmptyString(siteConfig.siteTitle, "情侣飞行棋配置库"),
    siteDescription: readNonEmptyString(
      siteConfig.siteDescription,
      "上传配置文件后自动生成、支持多种排序方式的分页索引页。"
    ),
    gameBaseUrl: normalizeHttpUrl(
      readNonEmptyString(siteConfig.gameBaseUrl, "https://lovegame.hoothin.com/ludo"),
      "gameBaseUrl"
    ),
    importParamMode: siteConfig.importParamMode === "file-url" ? "file-url" : "filename",
    perPage: normalizePerPage(siteConfig.perPage),
    locale,
    timeZone: normalizeTimeZone(requestedTimeZone, locale),
    siteBaseUrl: resolveSiteBaseUrl()
  };
}

/**
 * 递归收集目录内的非隐藏文件。
 *
 * @param {string} directory 待扫描目录。
 * @returns {string[]} 收集到的文件绝对路径。
 */
function collectConfigFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const results = [];
  const directoryEntries = readdirSync(directory, { withFileTypes: true });
  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.name.startsWith(".")) {
      continue;
    }

    const fullPath = join(directory, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      results.push(...collectConfigFiles(fullPath));
    } else if (directoryEntry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 将配置文件转换为页面、排序和导入链接需要的数据。
 *
 * @param {string} filePath 配置文件绝对路径。
 * @param {SiteSettings} settings 当前站点设置。
 * @returns {ConfigEntry} 完整配置条目。
 */
function createConfigEntry(filePath, settings) {
  const relativePath = toPosixPath(relative(projectDir, filePath));
  const relativeConfigPath = toPosixPath(relative(configDir, filePath));
  const fileStat = statSync(filePath);
  const updatedAt = readGitTimestamp(relativePath) ?? fileStat.mtimeMs;
  const content = readFileSync(filePath, "utf8");
  const importValue = settings.importParamMode === "file-url"
    ? buildPublicConfigUrl(relativeConfigPath, settings.siteBaseUrl)
    : relativeConfigPath;

  return {
    id: relativeConfigPath,
    absolutePath: filePath,
    relativePath,
    relativeConfigPath,
    displayName: prettifyName(relativeConfigPath),
    extensionLabel: extname(relativeConfigPath).replace(".", "").toUpperCase(),
    importUrl: buildImportUrl(importValue, settings.gameBaseUrl),
    rawPath: "configs/" + encodePath(relativeConfigPath),
    updatedAt,
    updatedLabel: formatDate(updatedAt, settings.locale, settings.timeZone),
    sizeLabel: formatFileSize(fileStat.size),
    summary: extractSummary(content)
  };
}

/**
 * 按 ID 顺序表解析配置条目，并验证顺序表完整性。
 *
 * @param {ReadonlyArray<ConfigEntry>} entries 全部配置条目。
 * @param {ReadonlyArray<string>} orderedIds 指定排序下的配置 ID。
 * @returns {ConfigEntry[]} 完成排序的配置条目。
 */
function resolveOrderedEntries(entries, orderedIds) {
  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  const orderedEntries = [];

  for (const entryId of orderedIds) {
    const entry = entriesById.get(entryId);
    if (!entry) {
      throw new Error("排序顺序引用了不存在的配置 ID：" + entryId);
    }
    orderedEntries.push(entry);
  }

  if (orderedEntries.length !== entries.length) {
    throw new Error("默认排序未覆盖全部配置条目。");
  }
  return orderedEntries;
}

/**
 * 重建 dist 输出目录，并在删除前验证目标没有越过项目边界。
 *
 * @returns {void}
 */
function resetOutputDirectory() {
  const expectedOutputDir = resolve(projectDir, "dist");
  if (resolve(outputDir) !== expectedOutputDir || dirname(expectedOutputDir) !== projectDir) {
    throw new Error("拒绝清理未经验证的输出目录：" + outputDir);
  }

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(join(outputDir, "configs"), { recursive: true });
}

/**
 * 把独立维护的客户端脚本和样式复制到构建目录。
 *
 * @returns {void}
 */
function copyStaticAssets() {
  for (const assetName of staticAssetNames) {
    const sourcePath = join(staticDir, assetName);
    if (!existsSync(sourcePath)) {
      throw new Error("缺少静态资源：" + sourcePath);
    }
    copyFileSync(sourcePath, join(outputDir, assetName));
  }
}

/**
 * 将原始配置复制到 dist/configs 并保留子目录结构。
 *
 * @param {ReadonlyArray<ConfigEntry>} entries 全部配置条目。
 * @returns {void}
 */
function copyConfigs(entries) {
  for (const entry of entries) {
    const targetPath = join(outputDir, "configs", ...entry.relativeConfigPath.split("/"));
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(entry.absolutePath, targetPath);
  }
}

/**
 * 写入客户端排序所需的版本化数据文件。
 *
 * @param {ReadonlyArray<ConfigEntry>} entries 全部配置条目。
 * @param {Record<string, string[]>} sortOrders 所有排序方式对应的 ID 顺序。
 * @param {SiteSettings} settings 当前站点设置。
 * @returns {void}
 */
function writeGalleryData(entries, sortOrders, settings) {
  const publicEntries = entries.map(entry => ({
    id: entry.id,
    displayName: entry.displayName,
    extensionLabel: entry.extensionLabel,
    importUrl: entry.importUrl,
    rawPath: entry.rawPath,
    updatedLabel: entry.updatedLabel,
    sizeLabel: entry.sizeLabel,
    summary: entry.summary
  }));
  const payload = {
    version: GALLERY_DATA_VERSION,
    defaultSort: DEFAULT_SORT,
    perPage: settings.perPage,
    sortOptions: SORT_OPTIONS,
    entries: publicEntries,
    orders: sortOrders
  };

  writeFileSync(
    join(outputDir, "gallery-data.json"),
    JSON.stringify(payload, null, 2) + "\n",
    "utf8"
  );
}

/**
 * 生成默认排序下的所有静态分页和 404 回退页。
 *
 * @param {ReadonlyArray<ConfigEntry>} entries 默认排序的配置条目。
 * @param {SiteSettings} settings 当前站点设置。
 * @returns {number} 生成的分页总数。
 */
function writePaginatedPages(entries, settings) {
  const totalPages = Math.max(1, Math.ceil(entries.length / settings.perPage));

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const startIndex = (pageNumber - 1) * settings.perPage;
    const pageEntries = entries.slice(startIndex, startIndex + settings.perPage);
    const targetDirectory = pageNumber === 1 ? outputDir : join(outputDir, "page", String(pageNumber));
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(
      join(targetDirectory, "index.html"),
      buildPageHtml(pageEntries, pageNumber, totalPages, entries.length, settings),
      "utf8"
    );
  }

  writeFileSync(
    join(outputDir, "404.html"),
    buildPageHtml(entries.slice(0, settings.perPage), 1, totalPages, entries.length, settings),
    "utf8"
  );
  return totalPages;
}

/**
 * 构建单个分页页面的完整 HTML。
 *
 * @param {ReadonlyArray<ConfigEntry>} entries 当前页配置条目。
 * @param {number} currentPage 当前页码。
 * @param {number} totalPages 分页总数。
 * @param {number} totalCount 配置总数。
 * @param {SiteSettings} settings 当前站点设置。
 * @returns {string} 完整 HTML 文本。
 */
function buildPageHtml(entries, currentPage, totalPages, totalCount, settings) {
  const rootPrefix = currentPage === 1 ? "./" : "../../";
  const cardsHtml = entries.length > 0
    ? entries.map(entry => buildCard(entry, rootPrefix)).join("\n")
    : buildEmptyState();

  return `<!DOCTYPE html>
<html lang="${escapeHtml(settings.locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(settings.siteTitle)}${currentPage > 1 ? ` - 第 ${currentPage} 页` : ""}</title>
    <meta name="description" content="${escapeHtml(settings.siteDescription)}" />
    <link rel="stylesheet" href="${rootPrefix}styles.css" />
  </head>
  <body data-current-page="${currentPage}" data-per-page="${settings.perPage}" data-root-prefix="${rootPrefix}">
    <div class="page-shell">
      <div class="hero-glow hero-glow-left"></div>
      <div class="hero-glow hero-glow-right"></div>
      <main class="layout">
        <section class="hero-card">
          <p class="hero-kicker">QingLv Config Gallery</p>
          <h1>${escapeHtml(settings.siteTitle)}</h1>
          <p class="hero-description">${escapeHtml(settings.siteDescription)}</p>
          <div class="hero-metrics">
            <div class="metric">
              <span class="metric-label">配置数量</span>
              <strong>${totalCount}</strong>
            </div>
            <div class="metric">
              <label class="metric-label" for="sort-select">排序方式</label>
              <select class="sort-select" id="sort-select">
                ${buildSortOptions()}
              </select>
            </div>
            <div class="metric">
              <span class="metric-label">当前页</span>
              <strong>${currentPage} / ${totalPages}</strong>
            </div>
          </div>
          <p class="sort-status" id="sort-status" role="status" aria-live="polite"></p>
        </section>

        <section class="grid" id="config-grid">
          ${cardsHtml}
        </section>

        ${buildPagination(currentPage, totalPages, rootPrefix)}
      </main>
    </div>
    <script src="${rootPrefix}app.js"></script>
  </body>
</html>`;
}

/**
 * 构建无配置时的静态提示。
 *
 * @returns {string} 空状态 HTML。
 */
function buildEmptyState() {
  return `
      <section class="empty-state">
        <p class="empty-kicker">暂无配置</p>
        <h2>把你的第一个 <code>.txt</code> 或 <code>.dat</code> 文件放进 <code>configs/</code></h2>
        <p>推送到 GitHub 后，这里会自动生成新的可导入卡片。</p>
      </section>
    `;
}

/**
 * 构建排序下拉选项，默认选中最近更新优先。
 *
 * @returns {string} 排序选项 HTML。
 */
function buildSortOptions() {
  return SORT_OPTIONS.map(option => {
    const selected = option.value === DEFAULT_SORT ? " selected" : "";
    return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
  }).join("\n                ");
}

/**
 * 构建单个配置卡片的静态 HTML。
 *
 * @param {ConfigEntry} entry 配置条目。
 * @param {string} rootPrefix 当前页面到站点根目录的相对前缀。
 * @returns {string} 配置卡片 HTML。
 */
function buildCard(entry, rootPrefix) {
  return `
    <article class="config-card" data-href="${escapeHtml(entry.importUrl)}" tabindex="0" role="link" aria-label="导入 ${escapeHtml(entry.displayName)}">
      <div class="card-topline">
        <span class="pill">${escapeHtml(entry.extensionLabel)}</span>
        <div class="card-timeblock">
          <span class="update-time">${escapeHtml(entry.updatedLabel)}</span>
          <span class="file-size">${escapeHtml(entry.sizeLabel)}</span>
        </div>
      </div>
      <h2>${escapeHtml(entry.displayName)}</h2>
      <p class="summary">${escapeHtml(entry.summary)}</p>
      <div class="card-actions">
        <a class="primary-link" href="${escapeHtml(entry.importUrl)}">立即导入</a>
        <a class="secondary-link" href="${escapeHtml(rootPrefix + entry.rawPath)}" target="_blank" rel="noreferrer noopener">查看原文件</a>
      </div>
    </article>
  `;
}

/**
 * 构建保留静态路由结构的分页导航。
 *
 * @param {number} currentPage 当前页码。
 * @param {number} totalPages 分页总数。
 * @param {string} rootPrefix 当前页面到站点根目录的相对前缀。
 * @returns {string} 分页导航 HTML；只有一页时返回空字符串。
 */
function buildPagination(currentPage, totalPages, rootPrefix) {
  if (totalPages <= 1) {
    return "";
  }

  const items = [];
  items.push(currentPage > 1
    ? `<a class="page-nav" data-page-link href="${pageHref(currentPage - 1, rootPrefix)}">上一页</a>`
    : `<span class="page-nav disabled">上一页</span>`);

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    items.push(pageNumber === currentPage
      ? `<span class="page-number active">${pageNumber}</span>`
      : `<a class="page-number" data-page-link href="${pageHref(pageNumber, rootPrefix)}">${pageNumber}</a>`);
  }

  items.push(currentPage < totalPages
    ? `<a class="page-nav" data-page-link href="${pageHref(currentPage + 1, rootPrefix)}">下一页</a>`
    : `<span class="page-nav disabled">下一页</span>`);

  return `<nav class="pagination" aria-label="分页导航">${items.join("")}</nav>`;
}

/**
 * 计算目标页的相对静态地址。
 *
 * @param {number} pageNumber 目标页码。
 * @param {string} rootPrefix 当前页面到站点根目录的相对前缀。
 * @returns {string} 目标页相对地址。
 */
function pageHref(pageNumber, rootPrefix) {
  return pageNumber === 1 ? rootPrefix : rootPrefix + "page/" + pageNumber + "/";
}

/**
 * 创建游戏导入链接，并由 URLSearchParams 负责安全编码参数。
 *
 * @param {string} importValue 导入参数值。
 * @param {string} gameBaseUrl 游戏基础地址。
 * @returns {string} 完整游戏导入地址。
 */
function buildImportUrl(importValue, gameBaseUrl) {
  const url = new URL(gameBaseUrl);
  url.searchParams.set("import", importValue);
  return url.toString();
}

/**
 * 从 GitHub Actions 环境解析站点根地址。
 *
 * @returns {string} 不含尾部斜杠的站点根地址，无法解析时返回空字符串。
 */
function resolveSiteBaseUrl() {
  const configuredUrl = readNonEmptyString(process.env.SITE_BASE_URL, "");
  if (configuredUrl.length > 0) {
    return trimTrailingSlashes(normalizeHttpUrl(configuredUrl, "SITE_BASE_URL"));
  }

  const pagesUrl = readNonEmptyString(process.env.GITHUB_PAGES_URL, "");
  if (pagesUrl.length > 0) {
    return trimTrailingSlashes(normalizeHttpUrl(pagesUrl, "GITHUB_PAGES_URL"));
  }

  const repository = readNonEmptyString(process.env.GITHUB_REPOSITORY, "");
  if (!repository.includes("/")) {
    return "";
  }
  const [owner, repositoryName] = repository.split("/");
  return "https://" + owner + ".github.io/" + repositoryName;
}

/**
 * 为 file-url 模式构建可公开访问的配置地址。
 *
 * @param {string} relativeConfigPath 配置文件相对路径。
 * @param {string} siteBaseUrl 站点根地址。
 * @returns {string} 配置公开地址或本地相对地址。
 */
function buildPublicConfigUrl(relativeConfigPath, siteBaseUrl) {
  const encodedPath = encodePath(relativeConfigPath);
  return siteBaseUrl.length === 0
    ? "./configs/" + encodedPath
    : siteBaseUrl + "/configs/" + encodedPath;
}

/**
 * 对路径的每个片段分别进行 URL 编码并保留目录分隔符。
 *
 * @param {string} value 原始路径。
 * @returns {string} URL 安全路径。
 */
function encodePath(value) {
  return value.split("/").map(segment => encodeURIComponent(segment)).join("/");
}

/**
 * 将配置文件路径转换为简洁展示名称。
 *
 * @param {string} relativeConfigPath 配置文件相对路径。
 * @returns {string} 去掉扩展名并清理分隔符后的名称。
 */
function prettifyName(relativeConfigPath) {
  const cleanPath = relativeConfigPath.replace(/\.(txt|dat)$/i, "");
  const pathSegments = cleanPath.split("/");
  return pathSegments[pathSegments.length - 1].replace(/[-_]+/g, " ");
}

/**
 * 从配置首个有效文本行提取摘要，复杂数据则使用通用说明。
 *
 * @param {string} content 配置文件 UTF-8 文本。
 * @returns {string} 页面卡片摘要。
 */
function extractSummary(content) {
  const contentLines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (contentLines.length === 0) {
    return "点击卡片即可跳转导入这个配置。";
  }

  const firstLine = contentLines[0];
  const looksStructured = /^[{\[]/.test(firstLine) || /^[A-Za-z0-9+/=]{40,}$/.test(firstLine);
  return firstLine.length > 90 || looksStructured
    ? "点击卡片即可跳转导入这个配置。"
    : firstLine;
}

/**
 * 读取配置文件最后一次 Git 提交时间，失败时允许调用方回退到 mtime。
 *
 * @param {string} relativePath 配置文件相对于仓库的路径。
 * @returns {number | null} 毫秒时间戳，读取失败时返回 null。
 */
function readGitTimestamp(relativePath) {
  try {
    const output = execFileSync(
      "git",
      ["-c", "safe.directory=" + projectDir, "-C", projectDir, "log", "-1", "--format=%ct", "--", relativePath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    if (output.length === 0) {
      return null;
    }

    const timestamp = Number(output);
    return Number.isFinite(timestamp) ? timestamp * 1000 : null;
  } catch (error) {
    console.warn(
      "[QingLv] 无法读取 " + relativePath + " 的 Git 时间，已回退到文件修改时间。",
      getErrorMessage(error)
    );
    return null;
  }
}

/**
 * 按站点区域设置和时区格式化日期。
 *
 * @param {number} timestamp 毫秒时间戳。
 * @param {string} locale 日期区域设置。
 * @param {string} timeZone 日期时区。
 * @returns {string} 页面展示日期。
 */
function formatDate(timestamp, locale, timeZone) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(timestamp));
}

/**
 * 将字节数格式化为可读文件大小。
 *
 * @param {number} size 文件字节数。
 * @returns {string} 页面展示大小。
 */
function formatFileSize(size) {
  if (size < 1024) {
    return size + " B";
  }
  if (size < 1024 * 1024) {
    return (size / 1024).toFixed(1) + " KB";
  }
  return (size / (1024 * 1024)).toFixed(2) + " MB";
}

/**
 * 使用 UTF-8 读取并解析 JSON 对象。
 *
 * @param {string} filePath JSON 文件路径。
 * @returns {Record<string, unknown>} 解析后的 JSON 对象。
 */
function readJson(filePath) {
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("JSON 根节点必须是对象。");
    }
    return value;
  } catch (error) {
    throw new Error("无法读取 JSON 配置：" + filePath, { cause: error });
  }
}

/**
 * 把每页数量标准化为正整数。
 *
 * @param {unknown} value 原始配置值。
 * @returns {number} 有效每页数量。
 */
function normalizePerPage(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? Math.floor(parsedValue) : 12;
}

/**
 * 验证区域设置；无效时记录原因并回退。
 *
 * @param {string} locale 原始区域设置。
 * @returns {string} 有效区域设置。
 */
function normalizeLocale(locale) {
  try {
    new Intl.DateTimeFormat(locale).format(new Date(0));
    return locale;
  } catch (error) {
    console.warn("[QingLv] 区域设置无效，已回退到 zh-CN。", getErrorMessage(error));
    return "zh-CN";
  }
}

/**
 * 验证时区；无效时记录原因并回退。
 *
 * @param {string} timeZone 原始时区。
 * @param {string} locale 已验证区域设置。
 * @returns {string} 有效时区。
 */
function normalizeTimeZone(timeZone, locale) {
  try {
    new Intl.DateTimeFormat(locale, { timeZone }).format(new Date(0));
    return timeZone;
  } catch (error) {
    console.warn("[QingLv] 时区无效，已回退到 Asia/Shanghai。", getErrorMessage(error));
    return "Asia/Shanghai";
  }
}

/**
 * 验证 URL 使用 HTTP 或 HTTPS 协议。
 *
 * @param {string} value 待验证地址。
 * @param {string} settingName 错误消息中的设置名称。
 * @returns {string} 验证通过的地址。
 */
function normalizeHttpUrl(value, settingName) {
  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch (error) {
    throw new Error(settingName + " 不是有效 URL。", { cause: error });
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error(settingName + " 仅支持 HTTP 或 HTTPS 协议。");
  }
  return value;
}

/**
 * 读取非空字符串或使用回退值。
 *
 * @param {unknown} value 原始值。
 * @param {string} fallback 空值回退。
 * @returns {string} 去除首尾空白的字符串。
 */
function readNonEmptyString(value, fallback) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * 去除 URL 尾部的全部斜杠。
 *
 * @param {string} value 原始 URL。
 * @returns {string} 不含尾部斜杠的 URL。
 */
function trimTrailingSlashes(value) {
  let result = value;
  while (result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * 将系统路径分隔符转换为 URL 使用的正斜杠。
 *
 * @param {string} filePath 系统文件路径。
 * @returns {string} POSIX 风格路径。
 */
function toPosixPath(filePath) {
  return filePath.split(sep).join("/");
}

/**
 * 转义 HTML 文本和属性中的特殊字符。
 *
 * @param {string} value 原始文本。
 * @returns {string} HTML 安全文本。
 */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 将未知错误转换为可记录文本。
 *
 * @param {unknown} error 捕获到的错误。
 * @returns {string} 可供日志使用的错误说明。
 */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
