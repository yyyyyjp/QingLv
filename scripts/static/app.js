const DEFAULT_SORT = "updated-desc";
const GALLERY_DATA_VERSION = 1;
const SUPPORTED_SORTS = new Set([
  "updated-desc",
  "updated-asc",
  "name-asc",
  "name-desc"
]);

/**
 * 浏览器端使用的配置卡片数据。
 *
 * @typedef {object} GalleryEntry
 * @property {string} id 配置条目的唯一标识。
 * @property {string} displayName 页面展示名称。
 * @property {string} extensionLabel 文件扩展名标签。
 * @property {string} importUrl 跳转游戏的导入地址。
 * @property {string} rawPath 配置原文件相对于站点根目录的地址。
 * @property {string} updatedLabel 已格式化的更新时间。
 * @property {string} sizeLabel 已格式化的文件大小。
 * @property {string} summary 配置摘要。
 */

/**
 * 页面排序功能所需的 DOM 与分页上下文。
 *
 * @typedef {object} PageContext
 * @property {HTMLElement} grid 配置卡片网格。
 * @property {HTMLSelectElement} select 排序选择器。
 * @property {HTMLElement} status 排序状态提示。
 * @property {number} currentPage 当前静态分页页码。
 * @property {number} perPage 每页配置数量。
 * @property {URL} siteRootUrl 当前 GitHub Pages 站点根地址。
 */

startGallery().catch(error => {
  console.error("[QingLv] 页面初始化失败。", error);
});

/**
 * 初始化卡片交互、URL 排序状态和非默认排序渲染。
 *
 * @returns {Promise<void>} 初始化完成后解决的 Promise。
 */
async function startGallery() {
  const context = readPageContext();
  setupCardNavigation(context.grid);

  const selection = resolveSortSelection(context.status);
  context.select.value = selection.value;
  bindSortChange(context);
  updatePaginationLinks(selection.value, selection.isExplicit);

  if (selection.value === DEFAULT_SORT) {
    return;
  }

  try {
    const orderedEntries = await loadOrderedEntries(context, selection.value);
    const pageEntries = getCurrentPageEntries(orderedEntries, context.currentPage, context.perPage);
    renderEntries(context.grid, pageEntries, context.siteRootUrl);
  } catch (error) {
    handleSortDataFailure(context, error);
  }
}

/**
 * 读取并验证页面生成器写入的 DOM 上下文。
 *
 * @returns {PageContext} 可用于排序和分页的页面上下文。
 */
function readPageContext() {
  const grid = document.querySelector("#config-grid");
  const select = document.querySelector("#sort-select");
  const status = document.querySelector("#sort-status");
  const currentPage = Number(document.body.dataset.currentPage);
  const perPage = Number(document.body.dataset.perPage);
  const rootPrefix = document.body.dataset.rootPrefix;

  if (!(grid instanceof HTMLElement)) {
    throw new Error("页面缺少配置卡片网格。");
  }
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("页面缺少排序选择器。");
  }
  if (!(status instanceof HTMLElement)) {
    throw new Error("页面缺少排序状态区域。");
  }
  if (!Number.isInteger(currentPage) || currentPage <= 0) {
    throw new Error("页面包含无效的当前页码。");
  }
  if (!Number.isInteger(perPage) || perPage <= 0) {
    throw new Error("页面包含无效的每页数量。");
  }
  if (typeof rootPrefix !== "string" || rootPrefix.length === 0) {
    throw new Error("页面缺少站点根路径。");
  }

  return {
    grid,
    select,
    status,
    currentPage,
    perPage,
    siteRootUrl: new URL(rootPrefix, window.location.href)
  };
}

/**
 * 从查询参数解析排序方式，并安全回退非法输入。
 *
 * @param {HTMLElement} status 排序状态提示区域。
 * @returns {{ value: string, isExplicit: boolean }} 已验证的排序选择。
 */
function resolveSortSelection(status) {
  const currentUrl = new URL(window.location.href);
  const requestedSort = currentUrl.searchParams.get("sort");

  if (requestedSort === null) {
    return { value: DEFAULT_SORT, isExplicit: false };
  }
  if (SUPPORTED_SORTS.has(requestedSort)) {
    return { value: requestedSort, isExplicit: true };
  }

  currentUrl.searchParams.delete("sort");
  replaceBrowserUrl(currentUrl);
  status.textContent = "无法识别该排序方式，已显示最近更新优先。";
  return { value: DEFAULT_SORT, isExplicit: false };
}

/**
 * 绑定排序选择器；切换后统一返回首页并把选择写入 URL。
 *
 * @param {PageContext} context 当前页面上下文。
 * @returns {void}
 */
function bindSortChange(context) {
  context.select.addEventListener("change", () => {
    const selectedSort = context.select.value;
    if (!SUPPORTED_SORTS.has(selectedSort)) {
      context.status.textContent = "请选择有效的排序方式。";
      return;
    }

    try {
      const targetUrl = new URL(context.siteRootUrl);
      targetUrl.searchParams.set("sort", selectedSort);
      window.location.assign(targetUrl.toString());
    } catch (error) {
      context.status.textContent = "无法切换排序，请刷新页面后重试。";
      console.error("[QingLv] 无法生成排序跳转地址。", error);
    }
  });
}

/**
 * 为分页链接附加或移除已经验证的排序参数。
 *
 * @param {string} sortValue 当前排序值。
 * @param {boolean} isExplicit URL 是否显式携带排序值。
 * @returns {void}
 */
function updatePaginationLinks(sortValue, isExplicit) {
  const links = document.querySelectorAll("[data-page-link]");

  for (const link of links) {
    if (!(link instanceof HTMLAnchorElement)) {
      continue;
    }

    try {
      const targetUrl = new URL(link.href, window.location.href);
      targetUrl.searchParams.delete("sort");
      if (isExplicit) {
        targetUrl.searchParams.set("sort", sortValue);
      }
      link.href = targetUrl.toString();
    } catch (error) {
      console.error("[QingLv] 无法更新分页链接。", error);
    }
  }
}

/**
 * 加载、验证排序数据并返回指定顺序的全部配置条目。
 *
 * @param {PageContext} context 当前页面上下文。
 * @param {string} selectedSort 已验证的排序值。
 * @returns {Promise<GalleryEntry[]>} 指定顺序的全部配置条目。
 */
async function loadOrderedEntries(context, selectedSort) {
  const dataUrl = new URL("gallery-data.json", context.siteRootUrl);
  const response = await fetch(dataUrl, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error("排序数据请求失败，HTTP 状态码：" + response.status);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("排序数据不是有效的 JSON。", { cause: error });
  }

  return parseGalleryData(payload, selectedSort, context.perPage, context.siteRootUrl);
}

/**
 * 验证排序数据契约，并把 ID 顺序解析为完整配置条目。
 *
 * @param {unknown} payload 未经信任的 JSON 数据。
 * @param {string} selectedSort 已验证的排序值。
 * @param {number} expectedPerPage 当前页面声明的每页数量。
 * @param {URL} siteRootUrl 当前站点根地址。
 * @returns {GalleryEntry[]} 完成校验且已排序的配置条目。
 */
function parseGalleryData(payload, selectedSort, expectedPerPage, siteRootUrl) {
  if (!isRecord(payload)) {
    throw new TypeError("排序数据根节点必须是对象。");
  }
  if (payload.version !== GALLERY_DATA_VERSION) {
    throw new Error("排序数据版本与页面脚本不兼容。");
  }
  if (payload.perPage !== expectedPerPage) {
    throw new Error("排序数据与当前页面的分页设置不一致。");
  }
  if (!Array.isArray(payload.entries) || !isRecord(payload.orders)) {
    throw new TypeError("排序数据缺少配置条目或顺序表。");
  }

  const entriesById = new Map();
  for (const candidate of payload.entries) {
    const entry = parseGalleryEntry(candidate, siteRootUrl);
    if (entriesById.has(entry.id)) {
      throw new Error("排序数据包含重复配置 ID。");
    }
    entriesById.set(entry.id, entry);
  }

  const order = payload.orders[selectedSort];
  if (!Array.isArray(order) || order.length !== entriesById.size) {
    throw new Error("所选排序的配置数量不完整。");
  }

  const orderedEntries = [];
  const seenIds = new Set();
  for (const entryId of order) {
    if (typeof entryId !== "string" || seenIds.has(entryId) || !entriesById.has(entryId)) {
      throw new Error("所选排序包含无效或重复的配置 ID。");
    }
    seenIds.add(entryId);
    orderedEntries.push(entriesById.get(entryId));
  }

  return orderedEntries;
}

/**
 * 验证单个配置卡片数据和它包含的链接。
 *
 * @param {unknown} candidate 未经信任的配置卡片数据。
 * @param {URL} siteRootUrl 当前站点根地址。
 * @returns {GalleryEntry} 完成校验的配置卡片数据。
 */
function parseGalleryEntry(candidate, siteRootUrl) {
  if (!isRecord(candidate)) {
    throw new TypeError("配置卡片数据必须是对象。");
  }

  const stringFields = [
    "id",
    "displayName",
    "extensionLabel",
    "importUrl",
    "rawPath",
    "updatedLabel",
    "sizeLabel",
    "summary"
  ];
  for (const fieldName of stringFields) {
    if (typeof candidate[fieldName] !== "string") {
      throw new TypeError("配置卡片字段 " + fieldName + " 必须是字符串。");
    }
  }

  validateImportUrl(candidate.importUrl);
  validateRawPath(candidate.rawPath, siteRootUrl);
  return {
    id: candidate.id,
    displayName: candidate.displayName,
    extensionLabel: candidate.extensionLabel,
    importUrl: candidate.importUrl,
    rawPath: candidate.rawPath,
    updatedLabel: candidate.updatedLabel,
    sizeLabel: candidate.sizeLabel,
    summary: candidate.summary
  };
}

/**
 * 验证游戏导入链接仅使用 HTTP 或 HTTPS。
 *
 * @param {string} importUrl 待验证的导入地址。
 * @returns {void}
 */
function validateImportUrl(importUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(importUrl);
  } catch (error) {
    throw new Error("配置包含无效的游戏导入地址。", { cause: error });
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("游戏导入地址使用了不受支持的协议。");
  }
}

/**
 * 验证原文件地址位于当前站点的 configs 目录内。
 *
 * @param {string} rawPath 待验证的站点相对地址。
 * @param {URL} siteRootUrl 当前站点根地址。
 * @returns {void}
 */
function validateRawPath(rawPath, siteRootUrl) {
  if (!rawPath.startsWith("configs/") || rawPath.split("/").includes("..")) {
    throw new Error("配置原文件地址不在 configs 目录内。");
  }

  const configsRootUrl = new URL("configs/", siteRootUrl);
  const rawUrl = new URL(rawPath, siteRootUrl);
  if (rawUrl.origin !== configsRootUrl.origin || !rawUrl.pathname.startsWith(configsRootUrl.pathname)) {
    throw new Error("配置原文件地址越过了当前站点边界。");
  }
}

/**
 * 从全局排序结果截取当前页条目。
 *
 * @param {ReadonlyArray<GalleryEntry>} entries 已完成全局排序的配置条目。
 * @param {number} currentPage 当前页码。
 * @param {number} perPage 每页数量。
 * @returns {GalleryEntry[]} 当前页应展示的配置条目。
 */
function getCurrentPageEntries(entries, currentPage, perPage) {
  const startIndex = (currentPage - 1) * perPage;
  return entries.slice(startIndex, startIndex + perPage);
}

/**
 * 使用安全 DOM API 替换配置卡片，避免把 JSON 内容作为 HTML 注入。
 *
 * @param {HTMLElement} grid 配置卡片网格。
 * @param {ReadonlyArray<GalleryEntry>} entries 当前页配置条目。
 * @param {URL} siteRootUrl 当前站点根地址。
 * @returns {void}
 */
function renderEntries(grid, entries, siteRootUrl) {
  const fragment = document.createDocumentFragment();

  if (entries.length === 0) {
    fragment.append(createClientEmptyState());
  }
  for (const entry of entries) {
    fragment.append(createCard(entry, siteRootUrl));
  }

  grid.replaceChildren(fragment);
}

/**
 * 创建排序后没有可展示条目时的客户端空状态。
 *
 * @returns {HTMLElement} 空状态节点。
 */
function createClientEmptyState() {
  const emptyState = document.createElement("section");
  emptyState.className = "empty-state";
  emptyState.append(
    createTextElement("p", "empty-kicker", "暂无配置"),
    createTextElement("h2", "", "当前页面没有可展示的配置"),
    createTextElement("p", "", "请返回首页或等待新的配置文件发布。")
  );
  return emptyState;
}

/**
 * 创建单个可点击且支持键盘访问的配置卡片。
 *
 * @param {GalleryEntry} entry 配置卡片数据。
 * @param {URL} siteRootUrl 当前站点根地址。
 * @returns {HTMLElement} 完整配置卡片节点。
 */
function createCard(entry, siteRootUrl) {
  const card = document.createElement("article");
  card.className = "config-card";
  card.dataset.href = entry.importUrl;
  card.tabIndex = 0;
  card.setAttribute("role", "link");
  card.setAttribute("aria-label", "导入 " + entry.displayName);

  const topLine = document.createElement("div");
  topLine.className = "card-topline";
  topLine.append(createTextElement("span", "pill", entry.extensionLabel));

  const timeBlock = document.createElement("div");
  timeBlock.className = "card-timeblock";
  timeBlock.append(
    createTextElement("span", "update-time", entry.updatedLabel),
    createTextElement("span", "file-size", entry.sizeLabel)
  );
  topLine.append(timeBlock);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.append(
    createLink("primary-link", entry.importUrl, "立即导入", false),
    createLink("secondary-link", new URL(entry.rawPath, siteRootUrl).toString(), "查看原文件", true)
  );

  card.append(
    topLine,
    createTextElement("h2", "", entry.displayName),
    createTextElement("p", "summary", entry.summary),
    actions
  );
  return card;
}

/**
 * 创建仅包含可信文本的普通元素。
 *
 * @param {string} tagName HTML 标签名。
 * @param {string} className 可选类名。
 * @param {string} textContent 元素文本。
 * @returns {HTMLElement} 创建完成的元素。
 */
function createTextElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className.length > 0) {
    element.className = className;
  }
  element.textContent = textContent;
  return element;
}

/**
 * 创建卡片操作链接。
 *
 * @param {string} className 链接类名。
 * @param {string} href 链接地址。
 * @param {string} label 链接显示文本。
 * @param {boolean} openInNewTab 是否在新标签页打开。
 * @returns {HTMLAnchorElement} 创建完成的链接。
 */
function createLink(className, href, label, openInNewTab) {
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.textContent = label;

  if (openInNewTab) {
    link.target = "_blank";
    link.rel = "noreferrer noopener";
  }
  return link;
}

/**
 * 使用事件委托维护静态卡片与动态卡片的一致点击、键盘行为。
 *
 * @param {HTMLElement} grid 配置卡片网格。
 * @returns {void}
 */
function setupCardNavigation(grid) {
  grid.addEventListener("click", event => {
    const card = findEventCard(event, grid);
    if (card === null || event.target instanceof Element && event.target.closest("a")) {
      return;
    }
    navigateToCard(card);
  });

  grid.addEventListener("keydown", event => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const card = findEventCard(event, grid);
    if (card === null || event.target instanceof Element && event.target.closest("a")) {
      return;
    }
    event.preventDefault();
    navigateToCard(card);
  });
}

/**
 * 从事件目标向上查找当前网格内的配置卡片。
 *
 * @param {Event} event 浏览器事件。
 * @param {HTMLElement} grid 配置卡片网格。
 * @returns {HTMLElement | null} 命中的配置卡片，没有命中时返回 null。
 */
function findEventCard(event, grid) {
  if (!(event.target instanceof Element)) {
    return null;
  }

  const card = event.target.closest("[data-href]");
  return card instanceof HTMLElement && grid.contains(card) ? card : null;
}

/**
 * 跳转到卡片声明的导入地址。
 *
 * @param {HTMLElement} card 配置卡片节点。
 * @returns {void}
 */
function navigateToCard(card) {
  const href = card.dataset.href;
  if (typeof href !== "string" || href.length === 0) {
    console.error("[QingLv] 配置卡片缺少导入地址。");
    return;
  }

  try {
    window.location.assign(href);
  } catch (error) {
    console.error("[QingLv] 无法打开配置导入地址。", error);
  }
}

/**
 * 在排序数据加载失败时恢复与静态内容一致的默认状态。
 *
 * @param {PageContext} context 当前页面上下文。
 * @param {unknown} error 捕获到的加载或验证错误。
 * @returns {void}
 */
function handleSortDataFailure(context, error) {
  console.error("[QingLv] 排序数据加载失败，已显示最近更新优先。", error);
  context.select.value = DEFAULT_SORT;
  context.status.textContent = "排序数据加载失败，已显示最近更新优先。";
  updatePaginationLinks(DEFAULT_SORT, false);

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.delete("sort");
  replaceBrowserUrl(currentUrl);
}

/**
 * 安全替换当前地址，不触发页面重新加载。
 *
 * @param {URL} targetUrl 替换后的浏览器地址。
 * @returns {void}
 */
function replaceBrowserUrl(targetUrl) {
  try {
    window.history.replaceState(null, "", targetUrl.toString());
  } catch (error) {
    console.error("[QingLv] 无法规范化排序地址。", error);
  }
}

/**
 * 判断未知值是否为可按字符串键访问的普通对象。
 *
 * @param {unknown} value 待判断的值。
 * @returns {value is Record<string, unknown>} 对象类型保护结果。
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
