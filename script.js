import {
  localDate,
  dateFrom,
  shift,
  dates,
  monday,
  defaults,
  at,
  entry,
  recordKey,
  achieved,
  state,
  stats,
  streaks,
  migrate,
  mergeRows,
  validateBackup,
  exerciseSessions,
  withExerciseSessions,
  habitReport,
} from "./core.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const today = () => localDate(),
  number = (n) => new Intl.NumberFormat("es").format(n),
  dateLabel = (d) =>
    dateFrom(d).toLocaleDateString("es", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
let storageKey = "rhythm-v2",
  rows = {},
  view = location.hash.slice(1) || "today",
  selected = today(),
  period = 30,
  historyDate = today(),
  editingHistory = false,
  undo = null,
  cloud = null,
  user = null,
  syncing = false,
  syncAgain = false,
  installPrompt = null,
  toastTimer;
function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function initialize() {
  rows = read(storageKey);
  if (!Object.keys(rows).length) {
    const raw = localStorage.getItem("calendarData");
    if (raw) {
      try {
        rows = migrate(JSON.parse(raw));
      } catch {
        notify("No se pudo leer el historial antiguo. Se conserva intacto.");
      }
    }
    if (!Object.keys(rows).length)
      for (const h of defaults())
        rows[`habit/${h.id}`] = {
          value: h,
          updatedAt: new Date().toISOString(),
        };
    persist();
  }
}
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(rows));
    return true;
  } catch {
    notify("No se pudo guardar. Exporta una copia antes de cerrar la página.");
    return false;
  }
}
function habits() {
  return Object.entries(rows)
    .filter(([k, r]) => k.startsWith("habit/") && r.value)
    .map(([, r]) => r.value);
}
function put(key, value) {
  const before = rows[key];
  const stamp = new Date(
    Math.max(Date.now(), Date.parse(before?.updatedAt || 0) + 1),
  ).toISOString();
  rows[key] = { value, updatedAt: stamp };
  if (persist()) {
    scheduleSync();
    return true;
  }
  return false;
}
function change(date, id, value) {
  if (date > today()) return;
  const key = recordKey(date, id),
    previous = rows[key]?.value ?? null;
  if (put(key, value)) {
    document.activeElement?.blur();
    undo = { key, previous };
    render();
    notify("Guardado", true);
  }
}
function notify(message, canUndo = false) {
  clearTimeout(toastTimer);
  $("#toast").innerHTML =
    `<span>${esc(message)}</span>${canUndo ? '<button id="undo">Deshacer</button>' : ""}`;
  $("#toast").classList.add("show");
  $("#undo")?.addEventListener("click", () => {
    if (undo) {
      put(undo.key, undo.previous);
      undo = null;
      render();
      notify("Cambio deshecho");
    }
  });
  toastTimer = setTimeout(
    () => $("#toast").classList.remove("show"),
    canUndo ? 8000 : 5000,
  );
}
function navigate(next) {
  document.activeElement?.blur();
  view = ["today", "history", "progress", "settings"].includes(next)
    ? next
    : "today";
  location.hash = view;
  render();
  $("#main").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}
function dateControls() {
  return `<div class="date-picker"><button class="small-btn" data-shift="-1" aria-label="Día anterior">←</button><input aria-label="Fecha del registro" type="date" id="selected-date" value="${selected}" max="${today()}"><button class="small-btn" data-shift="1" aria-label="Día siguiente" ${selected >= today() ? "disabled" : ""}>→</button>${selected !== today() ? '<button class="text-button" data-today>Ir a hoy</button>' : ""}</div>`;
}
function weekly(h, date) {
  const start = monday(date),
    end = shift(start, 6) < today() ? shift(start, 6) : today();
  return dates(start, end).filter((d) => {
    const config = at(h, d);
    return config && achieved(config, entry(rows, d, h.id));
  }).length;
}
function miniWeek(h) {
  return `<div class="week">${dates(
    monday(selected),
    shift(monday(selected), 6),
  )
    .map((d) => {
      const config = at(h, d);
      const s = config ? state(config, entry(rows, d, h.id)) : "unknown";
      return `<button title="${esc(dateLabel(d))}" aria-label="${esc(dateLabel(d))}: ${s === "done" ? "completado" : s === "rest" ? "descanso" : s === "partial" ? "avance parcial" : s === "miss" ? "no realizado" : "sin registrar"}" class="${s} ${d === selected ? "selected" : ""}" data-date="${d}" ${d > today() ? "disabled" : ""}>${s === "done" ? "✓" : dateFrom(d).toLocaleDateString("es", { weekday: "narrow" })}</button>`;
    })
    .join(
      "",
    )}<span>${h.frequency === "weekly" ? `${weekly(h, selected)}/${h.times} esta semana` : "Tu semana"}</span></div>`;
}
function habitIcon(h) {
  const paths = {
    exercise:
      '<path d="m5 8 3-3m8 14 3-3M4 7l3-3m10 16 3-3M7 7l10 10M3 10l7-7m4 18 7-7"/>',
    creatine:
      '<path d="m9 4 11 11a5 5 0 0 1-7 7L2 11a5 5 0 0 1 7-7Z" transform="translate(1 -1) scale(.9)"/><path d="m8 16 8-8"/>',
    steps:
      '<path d="M5 8c0-3 1-5 3-5s3 2 3 5-1 5-3 5-3-2-3-5Zm8 5c0-3 1-5 3-5s3 2 3 5-1 5-3 5-3-2-3-5Z"/><path d="M6 17h4m4 5h4"/>',
    reading:
      '<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>',
    food: '<path d="M12 8c-7-6-14 4-6 12 2 2 4-1 6 0 2-1 4 2 6 0 8-8 1-18-6-12Z"/><path d="M12 8c-1-4 1-6 4-6 0 3-1 5-4 6Z"/>',
  };
  return paths[h.id]
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[h.id]}</svg>`
    : esc(h.icon);
}
function exerciseEditor(record) {
  const sessions = exerciseSessions(record),
    total =
      record?.minutes ?? sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
  return `<div class="exercise-log">${sessions.length ? `<div class="session-heading"><span>${sessions.length} ${sessions.length === 1 ? "actividad" : "actividades"} de hoy</span>${total ? `<span>${number(total)} min registrados</span>` : ""}</div><ul class="session-list">${sessions.map((session) => `<li><span class="session-marker" aria-hidden="true"></span><span class="session-name">${esc(session.sport)}</span><span class="session-time">${session.minutes !== null ? `${number(session.minutes)} min` : "Sin duración"}</span><button type="button" class="remove-session" data-remove-session="${esc(session.id)}" aria-label="Eliminar ${esc(session.sport)}${session.minutes !== null ? ` de ${session.minutes} minutos` : ""}">×</button></li>`).join("")}</ul>${record?.unallocatedMinutes ? `<p class="exercise-hint">${number(record.unallocatedMinutes)} min anteriores sin desglose por actividad.</p>` : ""}` : ""}<form id="exercise-form" class="exercise-form"><label>Actividad<select id="sport" name="sport" required><option value="">Elegir ejercicio</option>${["Fuerza", "Abdominales", "Boxeo", "Fútbol", "Cardio", "Natación", "Pádel", "Tenis", "Movilidad", "Otro"].map((x) => `<option>${x}</option>`).join("")}</select></label><label>Duración · opcional<input id="duration" name="minutes" inputmode="numeric" type="number" min="0" max="1440" step="1" placeholder="Minutos"></label><button class="add-exercise" type="submit">+ Añadir ejercicio</button><label id="custom-sport-label" class="custom-sport" hidden>Nombre del ejercicio<input name="customSport" maxlength="80" placeholder="Por ejemplo, bicicleta"></label></form><p class="exercise-hint">${record?.status === "done" ? "Hábito completado. Puedes seguir sumando actividades." : "Cada actividad suma. El objetivo diario cuenta una sola vez."}</p></div>`;
}
function card(h) {
  const e = entry(rows, selected, h.id),
    s = state(h, e),
    done = s === "done",
    rest = s === "rest";
  const amount = e?.amount || 0;
  return `<article class="habit ${esc(h.color)} ${done ? "is-complete" : ""}" data-habit="${esc(h.id)}"><div class="habit-top"><div class="habit-icon" aria-hidden="true">${habitIcon(h)}</div><div class="habit-title"><button data-detail="${h.id}">${esc(h.name)}</button><small>${rest ? "Descanso previsto" : done ? (e?.legacy ? "Completado · registro antiguo" : "Objetivo completado") : h.kind === "number" ? `${number(amount)} / ${number(h.target)} ${esc(h.unit)}` : h.frequency === "weekly" ? `Tu objetivo: ${h.times} veces por semana` : "Un pequeño paso, cada día"}</small></div><button class="check ${done ? "done" : ""}" data-check="${h.id}" aria-label="${done ? "Deshacer" : "Completar"} ${esc(h.name)}" aria-pressed="${done}">${done ? "✓" : "+"}</button></div>
 ${h.kind === "number" ? `<form class="entry-controls" data-amount="${h.id}"><input type="number" inputmode="numeric" min="0" max="1000000" step="1" name="amount" placeholder="Cantidad" value="${e?.amount ?? ""}" aria-label="${esc(h.name)} en ${esc(h.unit)}" required><span class="quiet">${esc(h.unit)}</span><button class="small-btn" type="submit">Guardar</button><button class="text-button" type="button" data-minimum="${h.id}">Versión mínima (${Math.max(1, Math.round(h.target / 3))})</button></form>` : ""}
 ${h.kind === "rating" ? `<div class="entry-controls">${["Hoy fue diferente", "En parte", "Según lo previsto", "Muy a gusto"].map((label, i) => `<button class="small-btn" data-rating="${h.id}" data-value="${i}" aria-pressed="${e?.rating === i}">${label}</button>`).join("")}</div>` : ""}
 ${h.id === "exercise" ? exerciseEditor(e) : ""}
 ${miniWeek(h)}<div class="entry-controls"><button class="text-button" data-status="miss" data-id="${h.id}" aria-pressed="${s === "miss"}">${s === "miss" ? "• " : ""}No realizado</button><button class="text-button" data-status="rest" data-id="${h.id}" aria-pressed="${rest}">Descanso</button>${e ? `<button class="text-button" data-clear="${h.id}">Borrar registro</button>` : ""}</div></article>`;
}
function todayView() {
  const hs = habits()
      .map((h) => at(h, selected))
      .filter((h) => h && !h.archived),
    done = hs.filter((h) => achieved(h, entry(rows, selected, h.id))).length,
    rest = hs.filter(
      (h) => entry(rows, selected, h.id)?.status === "rest",
    ).length,
    total = hs.length - rest,
    pct = total ? Math.round((done / total) * 100) : 0;
  const past = Object.keys(rows)
    .filter((k) => k.startsWith("entry/") && rows[k].value)
    .map((k) => k.split("/")[1])
    .sort()
    .at(-1);
  const returning = past && past < shift(today(), -3);
  return `<div class="topline"><span>${esc(dateLabel(selected))}</span><span class="pill">A TU RITMO, SIN PRISAS</span></div><span class="eyebrow">TU ESPACIO DIARIO</span><h1>${selected !== today() ? "Un vistazo atrás." : returning ? "Qué bien volver a verte." : "Hoy también cuenta."}</h1><p class="subtitle">${returning ? "Retoma con un solo hábito. Tu progreso sigue aquí." : "Pequeñas acciones que, con el tiempo, lo cambian todo."}</p>${editingHistory ? `<div class="editing-banner"><span>Estás editando el ${esc(dateLabel(selected))}.</span><button class="text-button" data-back-history>Volver al historial</button></div>` : ""}${dateControls()}<div class="layout"><section><div class="hero"><div><span class="eyebrow">${selected === today() ? "TU DÍA" : "EL DÍA ELEGIDO"}</span><h2>${done === total && total ? "Has cumplido tus objetivos." : `${done} de ${total} hábitos completados`}</h2><p>${total === 0 ? "Hoy también puedes descansar." : done === total ? "Disfruta lo que has construido hoy." : "Cada pequeño paso suma."}</p></div><div class="ring" style="--p:${pct}"><span>${pct}%</span></div></div><div class="section-title"><h2>Tus hábitos</h2><small>${hs.length} hábitos · guardado automático</small></div>${hs.length ? hs.map(card).join("") : '<div class="empty">Añade tu primer hábito desde Ajustes.</div>'}</section><aside class="right-column"><div class="panel"><span class="eyebrow">PASO A PASO</span><h3 style="margin-top:9px">Esta semana</h3><div class="week-summary">${dates(
    monday(selected),
    shift(monday(selected), 6),
  )
    .map((d) => {
      const checked = hs.some((h) => entry(rows, d, h.id));
      return `<div class="day-dot"><span>${dateFrom(d).toLocaleDateString("es", { weekday: "narrow" })}</span><i class="${checked ? "done" : ""}">${checked ? "✓" : dateFrom(d).getDate()}</i></div>`;
    })
    .join(
      "",
    )}</div><p>Registrar con honestidad también es avanzar.</p></div>${milestonePanel()}<div class="panel note"><span class="eyebrow">UN MOMENTO PARA TI</span><h3 style="margin-top:9px">¿Cómo ha ido el día?</h3><textarea id="daily-note" maxlength="1000" placeholder="Algo que quieras recordar…" aria-label="Nota del día">${esc(rows[`note/${selected}`]?.value || "")}</textarea><button class="text-button" id="save-note">Guardar nota</button><div class="quiet">Opcional. Solo para ti.</div></div></aside></div>`;
}
function milestonePanel() {
  const total = habits().reduce(
    (sum, h) =>
      sum +
      stats(
        h,
        rows,
        [h, ...(h.versions || [])].map((v) => v.start).sort()[0],
        today(),
      ).done,
    0,
  );
  const next =
    [10, 25, 50, 100, 250, 500, 1000].find((n) => n > total) ||
    Math.ceil((total + 1) / 500) * 500;
  return `<div class="panel"><div class="milestone">✧</div><span class="eyebrow">LO QUE YA HAS CONSTRUIDO</span><p><span class="big-number">${number(total)}</span><br>hábitos completados</p><div class="bar"><i style="width:${Math.min(100, (total / next) * 100)}%"></i></div><span class="quiet">Próximo hito: ${number(next)} pequeños logros.</span></div>`;
}
const ratingLabels = [
  "Hoy fue diferente",
  "En parte",
  "Según lo previsto",
  "Muy a gusto",
];
const shortDate = (d) =>
  dateFrom(d).toLocaleDateString("es", { day: "numeric", month: "short" });
function recordsOn(date) {
  return habits().filter((h) => entry(rows, date, h.id));
}
function shiftMonth(date, n) {
  const d = dateFrom(date),
    first = new Date(d.getFullYear(), d.getMonth() + n, 1, 12),
    last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12);
  first.setDate(Math.min(d.getDate(), last.getDate()));
  const result = localDate(first);
  return result > today() ? today() : result;
}
function calendarMonth(
  date,
  {
    habit = null,
    from = null,
    to = today(),
    select = "history",
    compact = false,
  } = {},
) {
  const first = date.slice(0, 7) + "-01",
    d = dateFrom(first),
    last = localDate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)),
    padding = (d.getDay() + 6) % 7;
  return `<div class="month-grid ${compact ? "compact-calendar" : ""}"><div class="calendar-weekdays">${["L", "M", "X", "J", "V", "S", "D"].map((day) => `<span aria-hidden="true">${day}</span>`).join("")}</div><div class="calendar-dates">${'<span class="calendar-spacer"></span>'.repeat(padding)}${dates(
    first,
    last,
  )
    .map((day) => {
      const config = habit ? at(habit, day) : null,
        value = habit ? entry(rows, day, habit.id) : null;
      const count = recordsOn(day).length,
        hasNote = !!rows[`note/${day}`]?.value;
      const outside =
          day > to ||
          (from && day < from) ||
          (habit && (!config || config.archived)),
        status = habit
          ? !config || config.archived
            ? "inactive"
            : state(config, value)
          : count || hasNote
            ? "recorded"
            : "unknown";
      const label = habit
        ? statusLabel(config, value)
        : count
          ? `${count} hábitos anotados`
          : hasNote
            ? "Con nota"
            : "Sin registros";
      return `<button class="calendar-day-button ${status} ${select === "history" && historyDate === day ? "chosen" : ""} ${day === today() ? "is-today" : ""}" ${outside ? "disabled" : ""} ${select === "history" ? `data-history-date="${day}"` : `data-date="${day}"`} aria-label="${esc(dateLabel(day))}: ${esc(label)}" ${select === "history" ? `aria-pressed="${historyDate === day}"` : ""}><span>${dateFrom(day).getDate()}</span><i aria-hidden="true">${habit ? (status === "done" ? "✓" : status === "partial" ? "◐" : status === "rest" ? "–" : status === "miss" ? "×" : "·") : count || hasNote ? "•" : ""}</i></button>`;
    })
    .join("")}</div></div>`;
}
function statusLabel(h, e) {
  if (!h) return "Hábito todavía no activo";
  const st = state(h, e);
  return {
    unknown: "Sin registrar",
    done: h.kind === "rating" ? "Valoración anotada" : "Objetivo cumplido",
    partial: "Avance parcial",
    rest: "Descanso",
    miss: "No realizado",
  }[st];
}
function historyValue(h, e) {
  if (!e) return "Sin registrar";
  const st = state(h, e);
  if (st === "rest") return "Descanso";
  if (st === "miss") return "No realizado";
  if (h.id === "exercise") {
    const sessions = exerciseSessions(e);
    return sessions.length
      ? `${sessions.map((session) => session.sport + (session.minutes !== null ? ` · ${number(session.minutes)} min` : "")).join(" / ")}`
      : "Objetivo cumplido";
  }
  if (h.kind === "number")
    return e.legacy
      ? "Objetivo cumplido · cantidad no anotada"
      : `${number(e.amount || 0)} ${h.unit} · ${st === "done" ? "objetivo cumplido" : `objetivo: ${number(h.target)}`}`;
  if (h.kind === "rating")
    return ratingLabels[e.rating] || "Valoración anotada";
  return "Completado";
}
function historyView() {
  const first = historyDate.slice(0, 7) + "-01",
    month = dateFrom(first).toLocaleDateString("es", {
      month: "long",
      year: "numeric",
    }),
    end =
      historyDate.slice(0, 7) === today().slice(0, 7)
        ? today()
        : localDate(
            new Date(
              dateFrom(first).getFullYear(),
              dateFrom(first).getMonth() + 1,
              0,
              12,
            ),
          );
  const recorded = dates(first, end).filter(
    (day) => recordsOn(day).length || rows[`note/${day}`]?.value,
  ).length;
  const dayHabits = habits()
    .map((h) => ({ h: at(h, historyDate), original: h }))
    .filter(
      ({ h, original }) =>
        h && (!h.archived || entry(rows, historyDate, original.id)),
    );
  const note = rows[`note/${historyDate}`]?.value;
  return `<div class="topline"><span>TU RECORRIDO</span></div><h1>Tu historial, día a día.</h1><p class="subtitle">Elige un día para ver lo que anotaste. Puedes corregirlo cuando lo necesites.</p><div class="history-layout"><section class="panel history-calendar" aria-label="Calendario del historial"><div class="month-navigation"><button class="small-btn" data-history-month="-1" aria-label="Mes anterior" ${first <= "1900-01-01" ? "disabled" : ""}>←</button><h2>${esc(month)}</h2><button class="small-btn" data-history-month="1" aria-label="Mes siguiente" ${first.slice(0, 7) >= today().slice(0, 7) ? "disabled" : ""}>→</button></div>${calendarMonth(historyDate)}<div class="calendar-key"><span><i></i>Con registros</span><span><i class="blank"></i>Sin registros</span></div><p class="quiet month-summary">${recorded} ${recorded === 1 ? "día con registros" : "días con registros"} este mes</p><button class="text-button" data-history-today>Volver a hoy</button></section><section class="panel day-detail" aria-label="Detalle del día"><div class="section-title"><div><span class="eyebrow">${historyDate === today() ? "HOY" : "DÍA SELECCIONADO"}</span><h2>${esc(dateLabel(historyDate))}</h2></div><button class="secondary" data-edit-day="${historyDate}">Editar día</button></div>${
    dayHabits.length
      ? `<ul class="day-records">${dayHabits
          .map(({ h }) => {
            const e = entry(rows, historyDate, h.id);
            return `<li class="habit-palette ${esc(h.color)}"><span class="day-habit-icon">${habitIcon(h)}</span><div><strong>${esc(h.name)}</strong><p>${esc(historyValue(h, e))}</p></div><span class="record-status ${state(h, e)}">${esc(statusLabel(h, e))}</span></li>`;
          })
          .join("")}</ul>`
      : '<p class="empty">No había hábitos activos en esta fecha.</p>'
  }${note ? `<div class="history-note"><span class="eyebrow">TU NOTA</span><p>${esc(note)}</p></div>` : ""}<p class="quiet">«Sin registrar» significa que no hay información; no cuenta como «no realizado».</p></section></div>`;
}
function progressRange() {
  const starts = habits()
    .flatMap((h) => [h, ...(h.versions || [])].map((v) => v.start))
    .sort();
  const requested = shift(today(), 1 - period);
  return {
    start: starts[0] && starts[0] > requested ? starts[0] : requested,
    end: today(),
  };
}
function reportHeadline(h, r) {
  if (!r.days)
    return {
      value: "Sin datos",
      label: "Este hábito no estaba activo en el periodo.",
    };
  if (h.id === "exercise")
    return r.activities
      ? {
          value: `${number(r.activities)} ${r.activities === 1 ? "actividad" : "actividades"}`,
          label: `En ${r.activityDays} ${r.activityDays === 1 ? "día" : "días"} · ${number(r.minutes)} min anotados${r.doneWithoutActivities ? ` · ${r.doneWithoutActivities} días completados sin detalle` : ""}`,
        }
      : {
          value: `${r.done} ${r.done === 1 ? "día de ejercicio" : "días de ejercicio"}`,
          label: r.done
            ? "Marcados como completados, sin actividades detalladas."
            : "Todavía no has anotado ejercicio en este periodo.",
        };
  if (h.kind === "number")
    return {
      value: r.measuredDays
        ? `${number(r.amount)} ${h.unit}`
        : r.legacyDays
          ? `${r.legacyDays} días completados`
          : "Sin cantidades",
      label: r.measuredDays
        ? `Total anotado en ${r.measuredDays} ${r.measuredDays === 1 ? "día" : "días"}${r.legacyDays ? ` · ${r.legacyDays} días antiguos sin cantidad` : ""}`
        : "No se inventan cantidades para los registros antiguos.",
    };
  if (h.kind === "rating")
    return {
      value: `${r.done} ${r.done === 1 ? "valoración" : "valoraciones"}`,
      label: "Días en los que anotaste cómo fue. No es una nota de salud.",
    };
  return {
    value: `${r.done} ${r.done === 1 ? "día completado" : "días completados"}`,
    label: `De ${r.total} días activos, sin contar los descansos.`,
  };
}
function weeklyGoalText(h) {
  const current = at(h, today());
  return current && !current.archived && current.frequency === "weekly"
    ? `Esta semana (${shortDate(monday(today()))}–${shortDate(shift(monday(today()), 6))}): <strong>${weekly(h, today())} de ${current.times} días</strong>.`
    : "";
}
function progressCard(h, start, end) {
  const r = habitReport(h, rows, start, end),
    headline = reportHeadline(h, r),
    goal = weeklyGoalText(h);
  const context =
    h.kind === "number"
      ? `Objetivo alcanzado ${r.done} ${r.done === 1 ? "día" : "días"}.`
      : h.id === "exercise"
        ? "Varias actividades el mismo día cuentan como un solo día de entrenamiento."
        : "";
  return `<article class="panel progress-card habit-palette ${esc(h.color)}" data-progress-habit="${esc(h.id)}"><div class="progress-card-header"><div class="day-habit-icon">${habitIcon(h)}</div><h2>${esc(h.name)}${h.archived ? " · archivado" : ""}</h2><button class="text-button" data-detail="${h.id}">Ver detalle →</button></div><div class="progress-value">${esc(headline.value)}</div><p class="metric-explanation">${esc(headline.label)}</p>${context ? `<p class="quiet">${esc(context)}</p>` : ""}${goal ? `<p class="weekly-goal">${goal}</p>` : ""}<div class="record-breakdown"><span><i class="unknown"></i>${r.unknown} sin registrar</span>${r.rest ? `<span>${r.rest} descansos</span>` : ""}${r.partial ? `<span>${r.partial} avances parciales</span>` : ""}</div></article>`;
}
function progressView() {
  const hs = habits(),
    { start, end } = progressRange(),
    range = dates(start, end),
    logged = range.filter(
      (day) => recordsOn(day).length || rows[`note/${day}`]?.value,
    ).length;
  return `<div class="topline"><span>ENTIENDE TU CONSTANCIA</span></div><h1>Mira cuánto has avanzado.</h1><p class="subtitle">Cantidades reales y días anotados, con el mismo periodo para todos tus hábitos.</p><div class="progress-toolbar"><div class="periods" role="group" aria-label="Periodo del progreso">${[7, 30, 90, 365].map((p) => `<button class="small-btn ${period === p ? "active" : ""}" data-period="${p}" aria-pressed="${period === p}">${p === 365 ? "1 año" : `${p} días`}</button>`).join("")}</div><span class="period-label">${shortDate(start)} – ${shortDate(end)} ${dateFrom(end).getFullYear()}</span></div><div class="progress-overview"><div><span class="eyebrow">DÍAS CON ALGÚN REGISTRO</span><p><strong>${logged}</strong><span> de ${range.length} días</span></p></div><p>Cuenta los días en los que anotaste un hábito o una nota.<br>Los días vacíos quedan como «sin registrar».</p></div><div class="progress-cards">${hs.map((h) => progressCard(h, start, end)).join("")}</div><footer>Solo se incluyen días desde que creaste cada hábito. Los descansos aparecen aparte. «Sin registrar» indica falta de información, no que no lo hicieras.</footer>`;
}
function settingsView() {
  return `<div class="topline"><span>HAZLO TUYO</span></div><h1>Un sistema que encaje contigo.</h1><p class="subtitle">Define tus objetivos. Puedes cambiarlos sin reescribir tu historia.</p><div class="settings-grid"><section><div class="panel"><div class="section-title" style="margin-top:0"><h2>Tus hábitos</h2><button class="secondary" id="add-habit">+ Añadir</button></div>${habits()
    .map(
      (h) =>
        `<div class="section-title"><div><strong>${esc(h.name)}</strong><div class="quiet">${h.archived ? "Archivado" : h.frequency === "weekly" ? `${h.times} veces / semana` : `${number(h.target)} ${esc(h.unit)} / día`}</div></div><button class="text-button" data-edit="${h.id}">Editar</button></div>`,
    )
    .join(
      "",
    )}</div><div class="panel"><h2>Tus datos, contigo</h2><p>Descarga una copia completa o importa tu historial. La importación combina los registros y conserva el más reciente.</p><div class="entry-controls"><button class="primary" id="export">Exportar JSON</button><button class="secondary" id="csv">Exportar CSV</button></div><label style="margin-top:20px">Importar copia JSON<input id="import" type="file" accept="application/json,.json"></label><p class="quiet">El historial original «calendarData» permanece intacto en este navegador.</p></div></section><section><div class="panel"><h2>Tu cuenta</h2>${user ? `<p>Sesión iniciada: ${esc(user.email)}</p><p id="cloud-description">${esc($("#sync-status").textContent)}</p><div class="entry-controls"><button class="secondary" id="sync-now">Sincronizar ahora</button><button class="secondary" id="merge-local">Incorporar historial local</button><button class="text-button" id="signout">Cerrar sesión</button></div><p class="quiet">Tu historial local no se sube sin que pulses «Incorporar historial local». Al salir, vuelves a tus registros locales.</p>` : cloud ? `<p>Entra con tu correo para sincronizar entre dispositivos. Puedes seguir usándolo sin cuenta.</p><form id="login"><label>Correo electrónico<input name="email" type="email" autocomplete="email" required></label><button class="primary" type="submit">Enviar enlace de acceso</button></form><p class="quiet">Abrir el enlace del correo en este navegador iniciará tu sesión.</p>` : "<p>Funciona sin cuenta y sin conexión. La sincronización estará disponible cuando se configure el proyecto Supabase.</p>"}</div><div class="panel"><h2>Siempre a mano</h2><p>Instala la aplicación en tu pantalla de inicio para tener tus hábitos a un toque.</p><button class="secondary" id="install">Instalar aplicación</button><p class="quiet">En iPhone: Safari → Compartir → Añadir a pantalla de inicio. En otros navegadores, utiliza «Instalar» en el menú.</p></div><div class="panel note"><h2>Tu momento de registrar</h2><p>Elige una hora y descarga un recordatorio diario para tu calendario. Funcionará aunque la aplicación esté cerrada.</p><form id="reminder"><label>Hora del recordatorio<input name="time" type="time" value="21:30" required></label><button class="secondary">Descargar recordatorio</button></form><p class="quiet">Importa el archivo en tu calendario. Las alertas dependen de los permisos y ajustes de ese calendario.</p></div></section></div>`;
}
function render() {
  if (!["today", "history", "progress", "settings"].includes(view))
    view = "today";
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
  });
  $("#main").innerHTML = {
    today: todayView,
    history: historyView,
    progress: progressView,
    settings: settingsView,
  }[view]();
  $("#main").insertAdjacentHTML(
    "afterbegin",
    '<a class="mobile-brand" href="#today"><img src="./icon.svg" alt="" width="28" height="28"><span>A tu ritmo</span><small>TU SIGUIENTE PASO</small></a>',
  );
  bind();
}
function bind() {
  const on = (sel, event, fn) =>
    document
      .querySelectorAll(sel)
      .forEach((el) => el.addEventListener(event, fn));
  on("[data-history-date]", "click", (e) => {
    historyDate = e.currentTarget.dataset.historyDate;
    render();
    if (matchMedia("(max-width:850px)").matches)
      $(".day-detail")?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
          ? "instant"
          : "smooth",
      });
  });
  on("[data-history-month]", "click", (e) => {
    historyDate = shiftMonth(
      historyDate,
      Number(e.currentTarget.dataset.historyMonth),
    );
    render();
  });
  on("[data-history-today]", "click", () => {
    historyDate = today();
    render();
  });
  on("[data-edit-day]", "click", (e) => {
    selected = e.currentTarget.dataset.editDay;
    editingHistory = true;
    navigate("today");
  });
  on("[data-back-history]", "click", () => {
    historyDate = selected;
    editingHistory = false;
    navigate("history");
  });
  on("[data-date]", "click", (e) => {
    selected = e.currentTarget.dataset.date;
    $("#detail").close();
    navigate("today");
  });
  on("[data-shift]", "click", (e) => {
    selected = shift(selected, Number(e.currentTarget.dataset.shift));
    render();
  });
  on("[data-today]", "click", () => {
    selected = today();
    editingHistory = false;
    render();
  });
  $("#selected-date")?.addEventListener("change", (e) => {
    const d = e.target.value;
    if (d && d <= today() && d >= "1900-01-01") {
      selected = d;
      render();
    }
  });
  on("[data-check]", "click", (e) => {
    const id = e.currentTarget.dataset.check,
      h = at(
        habits().find((h) => h.id === id),
        selected,
      ),
      old = entry(rows, selected, id);
    if (h.kind === "rating" && !achieved(h, old)) {
      notify("Elige cómo ha ido tu alimentación.");
      return;
    }
    change(
      selected,
      id,
      achieved(h, old)
        ? id === "exercise" && exerciseSessions(old).length
          ? { ...old, status: "miss" }
          : null
        : {
            ...old,
            status: "done",
            ...(h.kind === "number" ? { amount: h.target, legacy: false } : {}),
          },
    );
  });
  on("[data-status]", "click", (e) =>
    change(selected, e.currentTarget.dataset.id, {
      ...(e.currentTarget.dataset.id === "exercise"
        ? entry(rows, selected, "exercise")
        : {}),
      status: e.currentTarget.dataset.status,
    }),
  );
  on("[data-clear]", "click", (e) =>
    change(selected, e.currentTarget.dataset.clear, null),
  );
  on("[data-amount]", "submit", (e) => {
    e.preventDefault();
    const amount = Number(new FormData(e.currentTarget).get("amount"));
    if (Number.isFinite(amount) && amount >= 0 && amount <= 1000000)
      change(selected, e.currentTarget.dataset.amount, {
        status: amount ? "done" : "miss",
        amount,
      });
  });
  on("[data-minimum]", "click", (e) => {
    const id = e.currentTarget.dataset.minimum,
      h = at(
        habits().find((h) => h.id === id),
        selected,
      );
    change(selected, id, {
      status: "done",
      amount: Math.max(1, Math.round(h.target / 3)),
    });
  });
  on("[data-rating]", "click", (e) =>
    change(selected, e.currentTarget.dataset.rating, {
      status: "done",
      rating: Number(e.currentTarget.dataset.value),
    }),
  );
  $("#sport")?.addEventListener("change", (e) => {
    const custom = e.target.value === "Otro";
    $("#custom-sport-label").hidden = !custom;
    $("#custom-sport-label input").required = custom;
    if (custom) $("#custom-sport-label input").focus();
  });
  $("#exercise-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      raw = form.get("minutes");
    const minutes = raw === "" ? null : Number(raw),
      sport = (
        form.get("sport") === "Otro"
          ? form.get("customSport")
          : form.get("sport")
      ).trim();
    if (
      !sport ||
      sport.length > 80 ||
      (minutes !== null &&
        (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440))
    ) {
      notify("Introduce una actividad y una duración válida.");
      return;
    }
    const old = entry(rows, selected, "exercise"),
      sessions = exerciseSessions(old);
    if (sessions.length >= 50) {
      notify("Ya hay 50 actividades en este día.");
      return;
    }
    change(
      selected,
      "exercise",
      withExerciseSessions({ ...old, status: "done" }, [
        ...sessions,
        { id: crypto.randomUUID(), sport, minutes },
      ]),
    );
  });
  on("[data-remove-session]", "click", (e) => {
    const old = entry(rows, selected, "exercise");
    change(
      selected,
      "exercise",
      withExerciseSessions(
        old,
        exerciseSessions(old).filter(
          (s) => s.id !== e.currentTarget.dataset.removeSession,
        ),
      ),
    );
  });
  $("#save-note")?.addEventListener("click", () => {
    put(`note/${selected}`, $("#daily-note").value.trim() || null);
    document.activeElement?.blur();
    notify("Nota guardada");
  });
  on("[data-period]", "click", (e) => {
    period = Number(e.currentTarget.dataset.period);
    render();
  });
  on("[data-detail]", "click", (e) =>
    showDetail(e.currentTarget.dataset.detail),
  );
  on("[data-edit]", "click", (e) => editHabit(e.currentTarget.dataset.edit));
  $("#add-habit")?.addEventListener("click", () => editHabit());
  $("#export")?.addEventListener("click", () =>
    download(
      "mis-habitos.json",
      JSON.stringify(
        { version: 2, exportedAt: new Date().toISOString(), rows },
        null,
        2,
      ),
      "application/json",
    ),
  );
  $("#csv")?.addEventListener("click", exportCSV);
  $("#import")?.addEventListener("change", importBackup);
  $("#install")?.addEventListener("click", async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      installPrompt = null;
    } else
      notify(
        "Usa el menú del navegador → Instalar o Añadir a pantalla de inicio.",
      );
  });
  $("#reminder")?.addEventListener("submit", calendarReminder);
  $("#login")?.addEventListener("submit", login);
  $("#signout")?.addEventListener("click", async () => {
    const { error } = await cloud.auth.signOut();
    if (error) notify("No se pudo cerrar la sesión. Inténtalo de nuevo.");
  });
  $("#sync-now")?.addEventListener("click", () => scheduleSync());
  $("#merge-local")?.addEventListener("click", () => {
    rows = mergeRows(rows, read("rhythm-v2"));
    persist();
    scheduleSync();
    notify("Historial local incorporado a esta cuenta.");
    render();
  });
}
function showDetail(id) {
  const h = habits().find((h) => h.id === id),
    { start, end } = progressRange(),
    r = habitReport(h, rows, start, end),
    headline = reportHeadline(h, r),
    streak = streaks(h, rows, today());
  const breakdown = [
    ["Objetivo cumplido", r.done, "done"],
    ["Avance parcial", r.partial, "partial"],
    ["No realizado", r.miss, "miss"],
    ["Descanso", r.rest, "rest"],
    ["Sin registrar", r.unknown, "unknown"],
  ];
  const months = [];
  for (let month = start.slice(0, 7) + "-01"; month <= end;) {
    months.push(month);
    const d = dateFrom(month);
    month = localDate(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
  }
  $("#detail-content").innerHTML =
    `<div class="detail-report habit-palette ${esc(h.color)}"><span class="eyebrow">${shortDate(start)} – ${shortDate(end)} · ${period === 365 ? "ÚLTIMO AÑO" : `ÚLTIMOS ${period} DÍAS`}</span><h2>${esc(h.name)}</h2><div class="progress-value">${esc(headline.value)}</div><p class="metric-explanation">${esc(headline.label)}</p><div class="detail-breakdown">${breakdown.map(([label, value, status]) => `<div><span class="status-dot ${status}"></span><span>${label === "Objetivo cumplido" && h.kind === "rating" ? "Valoración anotada" : label}</span><strong>${value} ${value === 1 ? "día" : "días"}</strong></div>`).join("")}</div><p class="quiet">Estos ${r.days} días son los días en los que el hábito estaba activo dentro del periodo seleccionado. Los descansos se muestran aparte.</p>${h.kind === "number" ? `<p class="quiet">Meta actual: ${number(h.target)} ${esc(h.unit)} por día. Los días anteriores se evalúan con la meta que tenían entonces.${r.legacyDays ? ` Hay ${r.legacyDays} días antiguos completados sin cantidad; cuentan como completados, pero no suman unidades.` : ""}</p>` : ""}${h.kind === "rating" ? `<h3>Tus valoraciones</h3><ul class="rating-distribution">${ratingLabels.map((label, i) => `<li><span>${label}</span><strong>${r.ratings[i]}</strong></li>`).join("")}</ul>` : ""}${h.frequency === "weekly" ? `<div class="weekly-detail"><h3>Tu objetivo por semanas</h3><p class="quiet">${weeklyGoalText(h)}</p>${r.weekResults.length ? `<ul>${r.weekResults.map((week) => `<li><span>${shortDate(week.start)} – ${shortDate(week.end)}</span><strong>${week.done} de ${week.target} días ${week.done >= week.target ? "✓" : ""}</strong></li>`).join("")}</ul>` : '<p class="quiet">Todavía no hay semanas completas dentro de este periodo.</p>'}<p class="quiet">La lista incluye solo semanas completas dentro de estas fechas. La semana actual se muestra aparte mientras sigue en curso.</p></div>` : ""}<details class="streak-info"><summary>Rachas hasta hoy</summary><p class="quiet">Actual: ${streak.current} ${streak.unit}. Mejor: ${streak.best} ${streak.unit}. Se calculan sobre todo tu historial hasta hoy, independientemente del periodo elegido.</p></details><h3 class="calendar-detail-title">Tus días, con fecha</h3><p class="quiet">Toca un día para consultar o corregir su registro.</p><div class="detail-calendars">${months.map((month) => `<section><h4>${dateFrom(month).toLocaleDateString("es", { month: "long", year: "numeric" })}</h4>${calendarMonth(month, { habit: h, from: start, to: end, select: "edit", compact: true })}</section>`).join("")}</div><div class="calendar-status-key"><span>✓ Completado</span><span>◐ Parcial</span><span>× No realizado</span><span>– Descanso</span><span>· Sin registrar</span></div><button class="text-button" data-edit="${h.id}">Editar objetivo</button></div>`;
  if (!$("#detail").open) $("#detail").showModal();
  $("#detail-content")
    .querySelectorAll("[data-date]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        historyDate = b.dataset.date;
        $("#detail").close();
        navigate("history");
      }),
    );
  $("#detail-content")
    .querySelector("[data-edit]")
    .addEventListener("click", () => editHabit(id));
}
function editHabit(id) {
  const h = habits().find((h) => h.id === id) || {
    id: crypto.randomUUID(),
    name: "",
    kind: "check",
    unit: "veces",
    target: 1,
    frequency: "daily",
    times: 3,
    color: "green",
    icon: "✧",
    start: today(),
    versions: [],
  };
  $("#detail-content").innerHTML =
    `<h2>${id ? "Ajustar hábito" : "Un nuevo pequeño paso"}</h2><form id="habit-form"><label>Nombre<input name="name" maxlength="80" value="${esc(h.name)}" required></label><div class="form-row"><label>Tipo<select name="kind">${[
      ["check", "Sí / no"],
      ["number", "Cantidad"],
      ["rating", "Valoración"],
    ]
      .map(
        ([k, label]) =>
          `<option value="${k}" ${h.kind === k ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Frecuencia<select name="frequency"><option value="daily" ${h.frequency === "daily" ? "selected" : ""}>Cada día</option><option value="weekly" ${h.frequency === "weekly" ? "selected" : ""}>Veces por semana</option></select></label></div><div class="form-row"><label>Cantidad objetivo por día<input name="target" type="number" min="1" max="1000000" value="${h.target}" required></label><label>Unidad<input name="unit" maxlength="25" value="${esc(h.unit)}" required></label></div><div class="form-row"><label>Veces por semana (1–7)<input name="times" type="number" min="1" max="7" value="${h.times}" required></label><label>Color<select name="color">${["green", "blue", "purple", "orange", "pink"].map((c, i) => `<option value="${c}" ${h.color === c ? "selected" : ""}>${["Turquesa", "Azul", "Violeta", "Terracota", "Frambuesa"][i]}</option>`).join("")}</select></label></div><label><span><input type="checkbox" name="archived" ${h.archived ? "checked" : ""}> Pausar / archivar este hábito</span></label><p class="quiet">Los cambios se aplican desde hoy. El historial anterior conserva el objetivo que tenía entonces. El descanso se registra por día.</p><button class="primary">Guardar hábito</button></form>`;
  if (!$("#detail").open) $("#detail").showModal();
  $("#habit-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)),
      versions = [...(h.versions || [])];
    if (id && h.start < today()) {
      const { versions: _, ...old } = h;
      versions.push(old);
    }
    const next = {
      ...h,
      ...f,
      target: Number(f.target),
      times: Number(f.times),
      archived: !!f.archived,
      start: today(),
      versions,
    };
    if (
      next.name.trim() &&
      next.target > 0 &&
      next.target <= 1000000 &&
      next.times >= 1 &&
      next.times <= 7
    ) {
      put(`habit/${h.id}`, next);
      $("#detail").close();
      render();
      notify("Hábito guardado");
    }
  });
}
function download(name, text, type) {
  const blob = new Blob([text], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCSV() {
  const cell = (x) =>
    '"' +
    String(x ?? "")
      .replace(/^[=+@\-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const lines = [
    [
      "Fecha",
      "Hábito",
      "Estado",
      "Cantidad",
      "Unidad",
      "Valoración",
      "Deporte",
      "Duración (min)",
      "Actividades (detalle)",
    ],
  ];
  for (const [k, r] of Object.entries(rows)) {
    if (!k.startsWith("entry/") || !r.value) continue;
    const [, d, id] = k.split("/"),
      h = habits().find((h) => h.id === id),
      e = r.value;
    lines.push([
      d,
      h?.name || id,
      e.status,
      e.amount,
      h?.unit,
      e.rating,
      e.sports?.join(", "),
      e.minutes,
      id === "exercise"
        ? exerciseSessions(e)
            .map(
              (session) =>
                `${session.sport}${session.minutes !== null ? ` (${session.minutes} min)` : ""}`,
            )
            .join(" | ")
        : "",
    ]);
  }
  download(
    "mis-habitos.csv",
    "\ufeff" + lines.map((l) => l.map(cell).join(";")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
async function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 20000000)
      throw Error("La copia es demasiado grande (máximo 20 MB).");
    const parsed = JSON.parse(await file.text());
    if (
      !parsed ||
      Array.isArray(parsed) ||
      typeof parsed !== "object" ||
      (parsed.version !== 2 &&
        !Object.keys(parsed).some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)))
    )
      throw Error("No es una copia de hábitos válida.");
    const incoming =
      parsed.version === 2 ? validateBackup(parsed) : migrate(parsed);
    if (!Object.keys(incoming).length)
      throw Error("No hay registros válidos en esta copia.");
    download(
      "habitos-antes-de-importar.json",
      JSON.stringify({ version: 2, rows }),
      "application/json",
    );
    rows = mergeRows(rows, incoming);
    persist();
    scheduleSync();
    render();
    notify("Copia combinada. Se ha descargado una copia anterior.");
  } catch (error) {
    notify(error.message || "No se pudo importar la copia.");
  }
}
function calendarReminder(e) {
  e.preventDefault();
  const [h, m] = new FormData(e.target).get("time").split(":"),
    d = today().replaceAll("-", ""),
    stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  download(
    "mi-momento-diario.ics",
    `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//A tu ritmo//ES\r\nBEGIN:VEVENT\r\nUID:${crypto.randomUUID()}@aturitmo\r\nDTSTAMP:${stamp}\r\nDTSTART:${d}T${h}${m}00\r\nDURATION:PT5M\r\nRRULE:FREQ=DAILY\r\nSUMMARY:Un momento para tus hábitos\r\nDESCRIPTION:Registra tu día en A tu ritmo. ${location.origin}${location.pathname}\r\nBEGIN:VALARM\r\nTRIGGER:PT0M\r\nACTION:DISPLAY\r\nDESCRIPTION:Tu momento diario\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
    "text/calendar",
  );
}
async function login(e) {
  e.preventDefault();
  const button = e.target.querySelector("button");
  button.disabled = true;
  try {
    const { error } = await cloud.auth.signInWithOtp({
      email: new FormData(e.target).get("email"),
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
    notify("Revisa tu correo y abre el enlace de acceso.");
  } catch {
    notify(
      "No se pudo enviar el enlace. Revisa el correo o inténtalo más tarde.",
    );
  } finally {
    button.disabled = false;
  }
}
function syncStatus(message) {
  $("#sync-status").textContent = message;
}
async function scheduleSync() {
  if (!cloud || !user) return;
  if (syncing) {
    syncAgain = true;
    return;
  }
  if (!navigator.onLine) {
    syncStatus("Sin conexión · pendiente de sincronizar");
    return;
  }
  syncing = true;
  syncStatus("Sincronizando…");
  const snapshot = { ...rows };
  const account = user.id;
  try {
    const { data, error } = await cloud.rpc("sync_habit_records", {
      incoming: Object.entries(snapshot).map(([key, r]) => ({
        key,
        value: r.value,
        updated_at: r.updatedAt,
      })),
    });
    if (error) throw error;
    if (user?.id !== account) return;
    const remote = {};
    for (const r of data)
      remote[r.key] = {
        value: r.value,
        updatedAt: new Date(r.updated_at).toISOString(),
      };
    rows = mergeRows(rows, remote);
    persist();
    syncStatus("Sincronizado · tus datos están al día");
    if (
      !$("#detail").open &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
    )
      render();
  } catch {
    syncStatus("Guardado local · sincronización pendiente");
  } finally {
    syncing = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync();
    }
  }
}
async function initCloud() {
  try {
    const config = await fetch("./cloud-config.json", {
      cache: "no-store",
    }).then((r) => (r.ok ? r.json() : null));
    if (!config?.url || !config?.publishableKey) return;
    const { createClient } = await import("@supabase/supabase-js");
    cloud = createClient(config.url, config.publishableKey);
    const { data } = await cloud.auth.getSession();
    await setSession(data.session);
    cloud.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT")
        setTimeout(() => setSession(session), 0);
    });
    if (view === "settings") render();
  } catch {
    syncStatus("Modo local · nube no disponible");
  }
}
async function setSession(session) {
  const next = session?.user || null;
  if (next?.id === user?.id) return;
  user = next;
  storageKey = user ? `rhythm-v2-${user.id}` : "rhythm-v2";
  rows = read(storageKey);
  if (!user) initialize();
  syncStatus(
    user ? "Preparando sincronización…" : "Guardado en este dispositivo",
  );
  render();
  await scheduleSync();
}
window.addEventListener("online", () => scheduleSync());
window.addEventListener("storage", (e) => {
  if (e.key === storageKey) {
    rows = mergeRows(rows, read(storageKey));
    render();
    scheduleSync();
  }
});
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener("hashchange", () => {
  view = location.hash.slice(1);
  render();
});
document.querySelectorAll("[data-view]").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.view === "today") {
      selected = today();
      editingHistory = false;
    }
    navigate(b.dataset.view);
  }),
);
$("#close-dialog").addEventListener("click", () => $("#detail").close());
$("#detail").addEventListener("click", (e) => {
  if (e.target === $("#detail")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
});
initialize();
render();
initCloud();
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js").catch(() => {});
