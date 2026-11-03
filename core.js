export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const dateFrom = (s) => new Date(`${s}T12:00:00`);
export function shift(s, n) {
  const d = dateFrom(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
}
export function dates(a, b) {
  const out = [];
  for (let d = a; d <= b; d = shift(d, 1)) out.push(d);
  return out;
}
export function monday(s) {
  return shift(s, -((dateFrom(s).getDay() + 6) % 7));
}
export const defaults = (start = localDate()) =>
  [
    {
      id: "exercise",
      name: "Ejercicio",
      icon: "↗",
      color: "orange",
      kind: "check",
      unit: "sesiones",
      target: 1,
      frequency: "weekly",
      times: 3,
    },
    {
      id: "creatine",
      name: "Creatina",
      icon: "◈",
      color: "purple",
      kind: "check",
      unit: "tomas",
      target: 1,
      frequency: "daily",
      times: 7,
    },
    {
      id: "steps",
      name: "Caminar",
      icon: "⌁",
      color: "green",
      kind: "number",
      unit: "pasos",
      target: 8000,
      frequency: "daily",
      times: 7,
    },
    {
      id: "reading",
      name: "Lectura",
      icon: "▤",
      color: "blue",
      kind: "number",
      unit: "min",
      target: 15,
      frequency: "daily",
      times: 7,
    },
    {
      id: "food",
      name: "Alimentación",
      icon: "◒",
      color: "pink",
      kind: "rating",
      unit: "registros",
      target: 1,
      frequency: "daily",
      times: 7,
    },
  ].map((h) => ({ ...h, start, archived: false, versions: [] }));
export function at(h, date) {
  return [...(h.versions || []), h]
    .filter((v) => v.start <= date)
    .sort((a, b) => b.start.localeCompare(a.start))[0];
}
export const recordKey = (date, id) => `entry/${date}/${id}`;
export const entry = (rows, date, id) => rows[recordKey(date, id)]?.value;
// Read old sports/minutes records without assigning the total to every sport.
export function exerciseSessions(record) {
  if (Array.isArray(record?.sessions)) return record.sessions;
  const sports = record?.sports?.length
    ? record.sports
    : record?.minutes > 0
      ? ["Actividad"]
      : [];
  return sports.map((sport, index) => ({
    id: `legacy-${index}`,
    sport,
    minutes: sports.length === 1 && record.minutes > 0 ? record.minutes : null,
  }));
}
export function withExerciseSessions(record, sessions) {
  const unallocatedMinutes =
    record?.unallocatedMinutes ??
    (!Array.isArray(record?.sessions) && record?.sports?.length > 1
      ? record.minutes || 0
      : 0);
  return {
    ...record,
    unallocatedMinutes,
    sessions,
    sports: [...new Set(sessions.map((s) => s.sport))],
    minutes:
      unallocatedMinutes +
      sessions.reduce((sum, s) => sum + (s.minutes || 0), 0),
  };
}
export function achieved(h, e) {
  return (
    !!e &&
    e.status === "done" &&
    (h.kind === "rating" ||
      h.kind === "check" ||
      e.legacy === true ||
      e.amount >= h.target)
  );
}
export function state(h, e) {
  if (!e) return "unknown";
  if (e.status === "rest") return "rest";
  if (achieved(h, e)) return "done";
  if (e.status === "done" && e.amount > 0) return "partial";
  return "miss";
}
export function stats(h, rows, from, to) {
  const eligible = dates(from, to)
    .map((date) => ({ date, h: at(h, date) }))
    .filter((x) => x.h && !x.h.archived);
  let done = 0,
    known = 0,
    total = 0,
    rest = 0,
    partial = 0,
    amount = 0;
  for (const x of eligible) {
    const e = entry(rows, x.date, h.id);
    const s = state(x.h, e);
    if (s === "rest") {
      rest++;
      continue;
    }
    total++;
    if (e) known++;
    if (s === "done") done++;
    if (s === "partial") partial++;
    if (e?.amount && !e.legacy) amount += e.amount;
  }
  const weeks = {};
  for (const { date, h: config } of eligible) {
    const w = monday(date);
    weeks[w] ??= { done: 0, target: config.times };
    if (achieved(config, entry(rows, date, h.id))) weeks[w].done++;
  }
  return {
    done,
    known,
    total,
    rest,
    partial,
    amount,
    rate: total ? Math.round((done / total) * 100) : null,
    coverage: total ? Math.round((known / total) * 100) : 0,
    weeks,
  };
}
export function streaks(h, rows, today) {
  const start = [h, ...(h.versions || [])].map((v) => v.start).sort()[0];
  if (h.frequency === "weekly") {
    let current = 0,
      best = 0,
      run = 0;
    const weeks = stats(h, rows, start, today).weeks;
    for (const [w, v] of Object.entries(weeks)) {
      if (w === monday(today) && v.done < v.target) continue;
      run = v.done >= v.target ? run + 1 : 0;
      best = Math.max(best, run);
      current = run;
    }
    return { current, best, unit: "semanas" };
  }
  let run = 0,
    best = 0;
  for (const d of dates(start, today)) {
    const config = at(h, d);
    if (!config || config.archived) continue;
    const s = state(config, entry(rows, d, h.id));
    if (s === "rest") continue;
    if (d === today && s !== "done") continue;
    run = s === "done" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: run, best, unit: "días" };
}
export function migrate(legacy) {
  const valid = Object.keys(legacy)
    .filter(
      (k) =>
        /^\d{4}-\d{2}-\d{2}$/.test(k) &&
        localDate(dateFrom(k)) === k &&
        k <= localDate() &&
        k >= "1900-01-01",
    )
    .sort();
  const habits = defaults(valid[0] || localDate()),
    rows = {};
  for (const d of valid)
    for (const h of habits) {
      const value =
        h.id === "exercise" && legacy[d]?.sports?.length
          ? true
          : legacy[d]?.[h.id];
      if (value === undefined || value === "") continue;
      let e = { status: value ? "done" : "miss" };
      if (h.kind === "number" && value === true) e.legacy = true;
      if (h.kind === "rating")
        e = {
          status: "done",
          rating: { Perfecto: 3, Bien: 2, Normal: 1, Mal: 0 }[value] ?? 1,
        };
      if (h.id === "exercise" && legacy[d].sports) e.sports = legacy[d].sports;
      rows[recordKey(d, h.id)] = {
        value: e,
        updatedAt: new Date().toISOString(),
      };
    }
  for (const h of habits)
    rows[`habit/${h.id}`] = { value: h, updatedAt: new Date().toISOString() };
  return rows;
}
export function mergeRows(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b))
    if (!out[k] || v.updatedAt > out[k].updatedAt) out[k] = v;
  return out;
}
const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value >= "1900-01-01" &&
  value <= localDate() &&
  Number.isFinite(dateFrom(value).getTime()) &&
  localDate(dateFrom(value)) === value;
function validHabit(v, id, version = false) {
  return (
    v &&
    v.id === id &&
    typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.length <= 80 &&
    ["check", "number", "rating"].includes(v.kind) &&
    ["daily", "weekly"].includes(v.frequency) &&
    Number.isFinite(v.target) &&
    v.target > 0 &&
    v.target <= 1000000 &&
    Number.isInteger(v.times) &&
    v.times >= 1 &&
    v.times <= 7 &&
    validDate(v.start) &&
    typeof v.unit === "string" &&
    v.unit.length <= 25 &&
    ["green", "blue", "purple", "orange", "pink"].includes(v.color) &&
    typeof v.icon === "string" &&
    v.icon.length <= 10 &&
    (version ||
      (Array.isArray(v.versions) &&
        v.versions.length <= 500 &&
        v.versions.every((old) => validHabit(old, id, true))))
  );
}
export function validateBackup(input) {
  if (
    !input ||
    input.version !== 2 ||
    !input.rows ||
    typeof input.rows !== "object" ||
    Array.isArray(input.rows) ||
    Object.keys(input.rows).length > 100000
  )
    throw Error("Formato de copia no válido.");
  for (const [k, row] of Object.entries(input.rows)) {
    if (
      !/^(habit\/[a-zA-Z0-9-]+|entry\/\d{4}-\d{2}-\d{2}\/[a-zA-Z0-9-]+|note\/\d{4}-\d{2}-\d{2})$/.test(
        k,
      ) ||
      !row ||
      !Number.isFinite(Date.parse(row.updatedAt))
    )
      throw Error("La copia contiene registros no válidos.");
    if (!k.startsWith("habit/") && !validDate(k.split("/")[1]))
      throw Error("Fecha no válida en la copia.");
    const v = row.value;
    if (v === null) continue;
    if (k.startsWith("habit/") && !validHabit(v, k.split("/")[1]))
      throw Error("Configuración de hábito no válida.");
    if (
      k.startsWith("entry/") &&
      (!v ||
        !["done", "miss", "rest"].includes(v.status) ||
        (v.amount !== undefined &&
          (!Number.isFinite(v.amount) || v.amount < 0 || v.amount > 1000000)) ||
        (v.rating !== undefined &&
          (!Number.isInteger(v.rating) || v.rating < 0 || v.rating > 3)) ||
        (v.minutes !== undefined &&
          (!Number.isFinite(v.minutes) ||
            v.minutes < 0 ||
            v.minutes > 72000)) ||
        (v.unallocatedMinutes !== undefined &&
          (!Number.isFinite(v.unallocatedMinutes) ||
            v.unallocatedMinutes < 0 ||
            v.unallocatedMinutes > 72000)) ||
        (v.sessions !== undefined &&
          (!Array.isArray(v.sessions) ||
            v.sessions.length > 50 ||
            v.sessions.some(
              (session) =>
                !session ||
                typeof session.id !== "string" ||
                !/^[a-zA-Z0-9-]{1,80}$/.test(session.id) ||
                typeof session.sport !== "string" ||
                !session.sport.trim() ||
                session.sport.length > 80 ||
                (session.minutes !== null &&
                  (!Number.isFinite(session.minutes) ||
                    session.minutes < 0 ||
                    session.minutes > 1440)),
            ) ||
            new Set(v.sessions.map((session) => session.id)).size !==
              v.sessions.length)) ||
        (v.sports !== undefined &&
          (!Array.isArray(v.sports) ||
            v.sports.length > 50 ||
            v.sports.some((s) => typeof s !== "string" || s.length > 80))))
    )
      throw Error("Registro no válido.");
    if (k.startsWith("note/") && (typeof v !== "string" || v.length > 1000))
      throw Error("Nota no válida.");
  }
  return input.rows;
}
