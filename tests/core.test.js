import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localDate,
  dateFrom,
  shift,
  dates,
  monday,
  defaults,
  stats,
  migrate,
  entry,
  recordKey,
  mergeRows,
  validateBackup,
  streaks,
  at,
} from "../core.js";
const h = defaults("2026-01-01")[3];
const rowsOf = (records) =>
  Object.fromEntries(
    Object.entries(records).map(([d, v]) => [
      recordKey(d, h.id),
      { value: v, updatedAt: "2026-02-01T00:00:00.000Z" },
    ]),
  );
test("calendar dates cross month, year and DST without UTC drift", () => {
  assert.equal(shift("2026-12-31", 1), "2027-01-01");
  assert.equal(shift("2026-03-29", 1), "2026-03-30");
  assert.equal(monday("2026-11-01"), "2026-10-26");
  assert.equal(dates("2026-02-28", "2026-03-01").length, 2);
});
test("unknown, partial, rest and miss remain distinct with correct coverage", () => {
  const rows = rowsOf({
    "2026-01-01": { status: "done", amount: 15 },
    "2026-01-02": { status: "done", amount: 5 },
    "2026-01-03": { status: "rest" },
    "2026-01-04": { status: "miss" },
  });
  const s = stats(h, rows, "2026-01-01", "2026-01-05");
  assert.equal(s.done, 1);
  assert.equal(s.total, 4);
  assert.equal(s.known, 3);
  assert.equal(s.partial, 1);
  assert.equal(s.rate, 25);
  assert.equal(s.coverage, 75);
  assert.equal(s.amount, 20);
});
test("old boolean quantities migrate without inventing measured amounts", () => {
  const rows = migrate({
    "2025-01-01": {
      steps: true,
      reading: false,
      food: "Bien",
      exercise: true,
      sports: ["Tenis"],
    },
  });
  assert.equal(entry(rows, "2025-01-01", "steps").legacy, true);
  const steps = rows["habit/steps"].value;
  assert.equal(stats(steps, rows, "2025-01-01", "2025-01-01").done, 1);
  assert.equal(stats(steps, rows, "2025-01-01", "2025-01-01").amount, 0);
  assert.equal(entry(rows, "2025-01-01", "reading").status, "miss");
  assert.deepEqual(entry(rows, "2025-01-01", "exercise").sports, ["Tenis"]);
});
test("goal versions preserve historical interpretation", () => {
  const changed = {
    ...h,
    start: "2026-01-03",
    target: 30,
    versions: [{ ...h, versions: undefined }],
  };
  const rows = rowsOf({
    "2026-01-01": { status: "done", amount: 15 },
    "2026-01-03": { status: "done", amount: 15 },
  });
  assert.equal(stats(changed, rows, "2026-01-01", "2026-01-03").done, 1);
  assert.equal(at(changed, "2025-12-31"), undefined);
});
test("deletion tombstones and stale remote values merge safely", () => {
  const newer = { a: { value: null, updatedAt: "2026-02-02T00:00:00.000Z" } },
    old = { a: { value: 123, updatedAt: "2026-02-01T00:00:00.000Z" } };
  assert.equal(mergeRows(newer, old).a.value, null);
});
test("rest does not break daily streak and today pending is allowed", () => {
  const rows = rowsOf({
    "2026-01-01": { status: "done", amount: 15 },
    "2026-01-02": { status: "rest" },
    "2026-01-03": { status: "done", amount: 15 },
  });
  assert.equal(streaks(h, rows, "2026-01-04").current, 2);
  assert.equal(streaks(h, rows, "2026-01-05").current, 0);
});
test("weekly targets ignore incomplete current week without losing previous streak", () => {
  const weekly = { ...h, start: "2026-01-05", frequency: "weekly", times: 2 };
  const rows = rowsOf({
    "2026-01-05": { status: "done", amount: 15 },
    "2026-01-07": { status: "done", amount: 15 },
  });
  assert.equal(streaks(weekly, rows, "2026-01-13").current, 1);
});
test("backup validates schema and rejects malformed imports", () => {
  const rows = migrate({ "2025-01-01": { steps: true } });
  assert.deepEqual(validateBackup({ version: 2, rows }), rows);
  assert.throws(() =>
    validateBackup({ version: 2, rows: { "__proto__/x": {} } }),
  );
  assert.throws(() =>
    validateBackup({
      version: 2,
      rows: { "habit/a": { value: { name: "x" }, updatedAt: "2026-01-01" } },
    }),
  );
});
