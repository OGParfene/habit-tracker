import { test } from "node:test";
import assert from "node:assert/strict";
import {
  habitReport,
  habitChartData,
  exerciseSessions,
  withExerciseSessions,
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
test("multiple workouts retain independent durations and count the habit only once", () => {
  const exercise = defaults("2026-01-01")[0];
  const first = withExerciseSessions({ status: "done" }, [
    { id: "a", sport: "Fuerza", minutes: 35 },
  ]);
  const second = withExerciseSessions(first, [
    ...exerciseSessions(first),
    { id: "b", sport: "Cardio", minutes: 20 },
  ]);
  assert.equal(second.minutes, 55);
  assert.deepEqual(second.sports, ["Fuerza", "Cardio"]);
  assert.equal(
    stats(
      exercise,
      { [recordKey("2026-01-01", "exercise")]: { value: second } },
      "2026-01-01",
      "2026-01-01",
    ).done,
    1,
  );
  const rows = {
    [recordKey("2026-01-01", "exercise")]: {
      value: second,
      updatedAt: "2026-01-01T00:00:00Z",
    },
  };
  assert.deepEqual(validateBackup({ version: 2, rows }), rows);
});
test("legacy exercise records are retained when adding a workout without duplicating durations", () => {
  const old = { status: "done", sports: ["Tenis"], minutes: 40 };
  const next = withExerciseSessions(old, [
    ...exerciseSessions(old),
    { id: "a", sport: "Movilidad", minutes: 10 },
  ]);
  assert.equal(next.minutes, 50);
  assert.equal(next.sessions[0].sport, "Tenis");
  assert.equal(next.sessions[0].minutes, 40);
  const ambiguous = {
    status: "done",
    sports: ["Tenis", "Fuerza"],
    minutes: 45,
  };
  const preserved = withExerciseSessions(ambiguous, [
    ...exerciseSessions(ambiguous),
    { id: "b", sport: "Cardio", minutes: 10 },
  ]);
  assert.equal(preserved.minutes, 55);
  assert.equal(preserved.unallocatedMinutes, 45);
  assert.equal(preserved.sessions[0].minutes, null);
});
test("backup rejects malformed workout lists", () => {
  const value = {
    status: "done",
    sessions: [{ id: "a", sport: "Fuerza", minutes: -1 }],
  };
  assert.throws(() =>
    validateBackup({
      version: 2,
      rows: {
        "entry/2026-01-01/exercise": {
          value,
          updatedAt: "2026-01-01T00:00:00Z",
        },
      },
    }),
  );
});
test("readable reports share one range and keep unknown, partial and rest separate", () => {
  const rows = rowsOf({
    "2026-01-01": { status: "done", amount: 15 },
    "2026-01-02": { status: "done", amount: 5 },
    "2026-01-03": { status: "rest" },
    "2026-01-04": { status: "miss" },
    "2026-01-06": { status: "done", amount: 40 },
  });
  const r = habitReport(h, rows, "2026-01-01", "2026-01-05");
  assert.equal(r.amount, 20);
  assert.equal(r.days, 5);
  assert.equal(r.done, 1);
  assert.equal(r.partial, 1);
  assert.equal(r.rest, 1);
  assert.equal(r.unknown, 1);
  assert.equal(r.miss, 1);
  assert.equal(r.measuredDays, 2);
  assert.equal(r.done + r.partial + r.rest + r.unknown + r.miss, r.days);
});
test("weekly report excludes partial and inactive weeks instead of comparing them with full targets", () => {
  const exercise = defaults("2026-01-06")[0];
  const r = habitReport(exercise, {}, "2026-01-01", "2026-01-21");
  assert.equal(r.weekResults.length, 1);
  assert.equal(r.weekResults[0].start, "2026-01-12");
  assert.equal(r.weekResults[0].target, 3);
});
test("workout report separates activities, days with activities, goal days and accumulated duration", () => {
  const exercise = defaults("2026-01-01")[0];
  const e = withExerciseSessions({ status: "done" }, [
    { id: "a", sport: "Fuerza", minutes: 30 },
    { id: "b", sport: "Cardio", minutes: 15 },
  ]);
  const rows = { [recordKey("2026-01-01", "exercise")]: { value: e } };
  const r = habitReport(exercise, rows, "2026-01-01", "2026-01-02");
  assert.equal(r.activities, 2);
  assert.equal(r.activityDays, 1);
  assert.equal(r.done, 1);
  assert.equal(r.minutes, 45);
});
test("chart data distinguishes recorded zero from missing, legacy, and rest", () => {
  const reading = defaults("2026-01-01")[3];
  const rows = rowsOf({
    "2026-01-01": { status: "miss", amount: 0 },
    "2026-01-03": { status: "done", legacy: true },
    "2026-01-04": { status: "rest" },
  });
  const chart = habitChartData(reading, rows, "2026-01-01", "2026-01-04");
  assert.equal(chart.group, "day");
  assert.deepEqual(
    chart.points.map((p) => p.value),
    [0, null, null, null],
  );
  assert.equal(chart.points[2].legacy, 1);
  assert.equal(chart.points[3].rest, 1);
});
test("weekly and monthly charts sum only measured quantities inside the selected range", () => {
  const reading = defaults("2026-01-01")[3];
  const rows = rowsOf({
    "2026-01-01": { status: "done", amount: 15 },
    "2026-01-02": { status: "done", amount: 5 },
    "2026-01-05": { status: "done", legacy: true },
    "2026-02-02": { status: "done", amount: 30 },
  });
  const weekly = habitChartData(reading, rows, "2026-01-01", "2026-02-01");
  assert.equal(weekly.group, "week");
  assert.equal(
    weekly.points.reduce((n, p) => n + (p.value || 0), 0),
    20,
  );
  assert.equal(weekly.points[1].value, null);
  assert.equal(weekly.points[0].target, null);
  const yearly = habitChartData(reading, rows, "2026-01-01", "2026-06-01");
  assert.equal(yearly.group, "month");
  assert.equal(yearly.points[0].value, 20);
  assert.equal(yearly.points[1].value, 30);
  assert.equal(yearly.points[2].value, null);
});
test("exercise chart counts completed days once and only shows weekly goals for full active weeks", () => {
  const exercise = defaults("2026-01-01")[0];
  const e = withExerciseSessions({ status: "done" }, [
    { id: "a", sport: "Fuerza", minutes: 30 },
    { id: "b", sport: "Cardio", minutes: 15 },
  ]);
  const rows = { [recordKey("2026-01-02", "exercise")]: { value: e } };
  const chart = habitChartData(exercise, rows, "2026-01-01", "2026-02-10");
  assert.equal(chart.group, "week");
  assert.equal(chart.points[0].value, 1);
  assert.equal(chart.points[0].target, null);
  assert.equal(chart.points[1].target, 3);
});
