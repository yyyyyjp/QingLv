export const DEFAULT_SORT = "updated-desc";
export const GALLERY_DATA_VERSION = 1;

export const SORT_OPTIONS = Object.freeze([
  Object.freeze({ value: "updated-desc", label: "最近更新优先" }),
  Object.freeze({ value: "updated-asc", label: "最早更新优先" }),
  Object.freeze({ value: "name-asc", label: "名称升序（A–Z）" }),
  Object.freeze({ value: "name-desc", label: "名称降序（Z–A）" })
]);

/**
 * 可参与排序的配置条目。
 *
 * @typedef {object} SortableConfigEntry
 * @property {string} id 配置条目的唯一标识。
 * @property {string} displayName 页面展示名称。
 * @property {string} relativeConfigPath 配置文件相对于 configs 目录的路径。
 * @property {number} updatedAt 配置文件最近提交时间的毫秒时间戳。
 */

/**
 * 为所有受支持的排序方式生成全量配置 ID 顺序。
 *
 * 排序在分页之前完成，保证不同分页页使用同一套全局顺序。
 *
 * @param {ReadonlyArray<SortableConfigEntry>} entries 全部可排序配置条目。
 * @param {string} locale 名称排序使用的区域设置。
 * @returns {Record<string, string[]>} 以排序值为键、配置 ID 数组为值的顺序表。
 */
export function createSortOrders(entries, locale) {
  validateSortableEntries(entries);
  const collator = createNameCollator(locale);
  const comparators = {
    "updated-desc": (left, right) => compareUpdatedEntries(left, right, -1, collator),
    "updated-asc": (left, right) => compareUpdatedEntries(left, right, 1, collator),
    "name-asc": (left, right) => compareNamedEntries(left, right, 1, collator),
    "name-desc": (left, right) => compareNamedEntries(left, right, -1, collator)
  };
  const orders = {};

  for (const option of SORT_OPTIONS) {
    const comparator = comparators[option.value];
    orders[option.value] = [...entries].sort(comparator).map(entry => entry.id);
  }

  return orders;
}

/**
 * 截取指定页对应的配置 ID。
 *
 * @param {ReadonlyArray<string>} orderedIds 已完成全局排序的配置 ID。
 * @param {number} currentPage 从 1 开始的当前页码。
 * @param {number} perPage 每页配置数量。
 * @returns {string[]} 当前页应展示的配置 ID。
 */
export function paginateEntryIds(orderedIds, currentPage, perPage) {
  if (!Array.isArray(orderedIds)) {
    throw new TypeError("分页顺序必须是数组。");
  }
  if (!Number.isInteger(currentPage) || currentPage <= 0) {
    throw new RangeError("当前页码必须是大于 0 的整数。");
  }
  if (!Number.isInteger(perPage) || perPage <= 0) {
    throw new RangeError("每页数量必须是大于 0 的整数。");
  }

  const startIndex = (currentPage - 1) * perPage;
  return orderedIds.slice(startIndex, startIndex + perPage);
}

/**
 * 验证排序输入，避免重复 ID 或缺失字段生成损坏的页面数据。
 *
 * @param {ReadonlyArray<SortableConfigEntry>} entries 待验证的配置条目。
 * @returns {void}
 */
function validateSortableEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError("配置条目必须是数组。");
  }

  const knownIds = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      throw new TypeError("配置条目必须是对象。");
    }
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      throw new TypeError("配置条目缺少有效 ID。");
    }
    if (knownIds.has(entry.id)) {
      throw new Error(`发现重复的配置 ID：${entry.id}`);
    }
    if (typeof entry.displayName !== "string" || typeof entry.relativeConfigPath !== "string") {
      throw new TypeError(`配置条目 ${entry.id} 缺少有效名称或路径。`);
    }
    if (!Number.isFinite(entry.updatedAt)) {
      throw new TypeError(`配置条目 ${entry.id} 缺少有效更新时间。`);
    }

    knownIds.add(entry.id);
  }
}

/**
 * 创建支持数字感知的名称比较器，并在区域设置无效时安全回退。
 *
 * @param {string} locale 首选区域设置。
 * @returns {Intl.Collator} 可复用的字符串比较器。
 */
function createNameCollator(locale) {
  const normalizedLocale = typeof locale === "string" && locale.trim().length > 0
    ? locale.trim()
    : "zh-CN";

  try {
    return new Intl.Collator(normalizedLocale, {
      numeric: true,
      sensitivity: "base"
    });
  } catch (error) {
    console.warn(
      `[QingLv] 无法使用区域设置“${normalizedLocale}”，名称排序已回退到 zh-CN。`,
      getErrorMessage(error)
    );
    return new Intl.Collator("zh-CN", {
      numeric: true,
      sensitivity: "base"
    });
  }
}

/**
 * 按更新时间比较两个配置条目。
 *
 * @param {SortableConfigEntry} left 左侧配置条目。
 * @param {SortableConfigEntry} right 右侧配置条目。
 * @param {1 | -1} direction 1 表示升序，-1 表示降序。
 * @param {Intl.Collator} collator 稳定路径排序使用的比较器。
 * @returns {number} Array.prototype.sort 所需的比较结果。
 */
function compareUpdatedEntries(left, right, direction, collator) {
  const timeDifference = left.updatedAt - right.updatedAt;
  if (timeDifference !== 0) {
    return direction * timeDifference;
  }

  return compareStablePath(left.relativeConfigPath, right.relativeConfigPath, collator);
}

/**
 * 按展示名称比较两个配置条目。
 *
 * @param {SortableConfigEntry} left 左侧配置条目。
 * @param {SortableConfigEntry} right 右侧配置条目。
 * @param {1 | -1} direction 1 表示升序，-1 表示降序。
 * @param {Intl.Collator} collator 名称及稳定路径排序使用的比较器。
 * @returns {number} Array.prototype.sort 所需的比较结果。
 */
function compareNamedEntries(left, right, direction, collator) {
  const nameDifference = collator.compare(left.displayName, right.displayName);
  if (nameDifference !== 0) {
    return direction * nameDifference;
  }

  return compareStablePath(left.relativeConfigPath, right.relativeConfigPath, collator);
}

/**
 * 使用区域比较和原始字符比较生成完全稳定的路径顺序。
 *
 * @param {string} leftPath 左侧相对路径。
 * @param {string} rightPath 右侧相对路径。
 * @param {Intl.Collator} collator 首选字符串比较器。
 * @returns {number} 稳定的路径比较结果。
 */
function compareStablePath(leftPath, rightPath, collator) {
  const localizedDifference = collator.compare(leftPath, rightPath);
  if (localizedDifference !== 0) {
    return localizedDifference;
  }
  if (leftPath === rightPath) {
    return 0;
  }
  return leftPath < rightPath ? -1 : 1;
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
