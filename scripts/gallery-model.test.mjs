import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  createSortOrders,
  paginateEntryIds
} from "./gallery-model.mjs";

/**
 * 创建排序测试需要的最小配置条目。
 *
 * @param {string} id 配置唯一标识。
 * @param {string} displayName 页面展示名称。
 * @param {number} updatedAt 更新时间毫秒时间戳。
 * @param {string} [relativeConfigPath=id] 可选相对路径。
 * @returns {{ id: string, displayName: string, updatedAt: number, relativeConfigPath: string }} 测试配置条目。
 */
function createEntry(id, displayName, updatedAt, relativeConfigPath = id) {
  return {
    id,
    displayName,
    updatedAt,
    relativeConfigPath
  };
}

test("默认排序保持最近更新时间优先", () => {
  const entries = [
    createEntry("older.dat", "Older", 100),
    createEntry("newest.dat", "Newest", 300),
    createEntry("middle.dat", "Middle", 200)
  ];
  const orders = createSortOrders(entries, "zh-CN");

  assert.equal(DEFAULT_SORT, "updated-desc");
  assert.deepEqual(orders["updated-desc"], ["newest.dat", "middle.dat", "older.dat"]);
  assert.deepEqual(orders["updated-asc"], ["older.dat", "middle.dat", "newest.dat"]);
});

test("名称排序支持数字感知和正倒序", () => {
  const entries = [
    createEntry("item-10.dat", "Item 10", 100),
    createEntry("alpha.dat", "Alpha", 100),
    createEntry("item-2.dat", "Item 2", 100)
  ];
  const orders = createSortOrders(entries, "en-US");

  assert.deepEqual(orders["name-asc"], ["alpha.dat", "item-2.dat", "item-10.dat"]);
  assert.deepEqual(orders["name-desc"], ["item-10.dat", "item-2.dat", "alpha.dat"]);
});

test("相同名称和时间使用相对路径生成稳定顺序", () => {
  const entries = [
    createEntry("second", "相同名称", 100, "folder-b/config.dat"),
    createEntry("first", "相同名称", 100, "folder-a/config.dat")
  ];
  const orders = createSortOrders(entries, "zh-CN");

  for (const option of SORT_OPTIONS) {
    assert.deepEqual(orders[option.value], ["first", "second"]);
  }
});

test("分页在全局排序完成后截取目标范围", () => {
  const entries = Array.from({ length: 25 }, (_, index) => {
    const displayNumber = String(index + 1).padStart(2, "0");
    return createEntry("config-" + displayNumber, "Config " + displayNumber, index + 1);
  });
  const orders = createSortOrders(entries, "en-US");
  const secondPageIds = paginateEntryIds(orders["updated-desc"], 2, 12);

  assert.equal(secondPageIds.length, 12);
  assert.deepEqual(secondPageIds, orders["updated-desc"].slice(12, 24));
  assert.equal(secondPageIds[0], "config-13");
  assert.equal(secondPageIds[11], "config-02");
});

test("排序结果完整覆盖配置并拒绝重复 ID", () => {
  const entries = [
    createEntry("one.dat", "One", 100),
    createEntry("two.dat", "Two", 200),
    createEntry("three.dat", "Three", 300)
  ];
  const orders = createSortOrders(entries, "zh-CN");

  for (const option of SORT_OPTIONS) {
    assert.equal(new Set(orders[option.value]).size, entries.length);
    assert.deepEqual([...orders[option.value]].sort(), entries.map(entry => entry.id).sort());
  }

  assert.throws(
    () => createSortOrders([entries[0], entries[0]], "zh-CN"),
    /重复的配置 ID/
  );
});

test("分页参数必须是正整数", () => {
  assert.throws(() => paginateEntryIds(["one"], 0, 12), /当前页码/);
  assert.throws(() => paginateEntryIds(["one"], 1, 0), /每页数量/);
  assert.throws(() => paginateEntryIds("one", 1, 12), /分页顺序/);
});
