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
  view = ["today", "history", "progress", "settings"].includes(next)
    ? next
    : "today";
  location.hash = view;
  render();
  $("#main").focus({ preventScroll: true });
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
  return `<div class="topline"><span>${esc(dateLabel(selected))}</span><span class="pill">A TU RITMO, SIN PRISAS</span></div><span class="eyebrow">TU ESPACIO DIARIO</span><h1>${selected !== today() ? "Un vistazo atrás." : returning ? "Qué bien volver a verte." : "Hoy también cuenta."}</h1><p class="subtitle">${returning ? "Retoma con un solo hábito. Tu progreso sigue aquí." : "Pequeñas acciones que, con el tiempo, lo cambian todo."}</p>${dateControls()}<div class="layout"><section><div class="hero"><div><span class="eyebrow">${selected === today() ? "TU DÍA" : "EL DÍA ELEGIDO"}</span><h2>${done === total && total ? "Has cumplido tus objetivos." : `${done} de ${total} hábitos completados`}</h2><p>${total === 0 ? "Hoy también puedes descansar." : done === total ? "Disfruta lo que has construido hoy." : "Cada pequeño paso suma."}</p></div><div class="ring" style="--p:${pct}"><span>${pct}%</span></div></div><div class="section-title"><h2>Tus hábitos</h2><small>${hs.length} hábitos · guardado automático</small></div>${hs.length ? hs.map(card).join("") : '<div class="empty">Añade tu primer hábito desde Ajustes.</div>'}</section><aside class="right-column"><div class="panel"><span class="eyebrow">PASO A PASO</span><h3 style="margin-top:9px">Esta semana</h3><div class="week-summary">${dates(
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
function historyView() {
  const hs = habits(),
    start = shift(selected, -13);
  return `<div class="topline"><span>TU RECORRIDO</span><span class="pill">CADA DÍA TIENE SU HISTORIA</span></div><h1>Todo lo que suma.</h1><p class="subtitle">Últimos 14 días hasta la fecha elegida. Toca un registro para editar ese día.</p>${dateControls()}<div class="history-table"><table><thead><tr><th>Día</th>${hs.map((h) => `<th>${esc(h.name)}</th>`).join("")}<th>Nota</th></tr></thead><tbody>${dates(
    start,
    selected,
  )
    .reverse()
    .map(
      (d) =>
        `<tr><td><button data-date="${d}">${dateFrom(d).toLocaleDateString("es", { day: "numeric", month: "short" })}</button></td>${hs
          .map((h) => {
            const config = at(h, d);
            const e = entry(rows, d, h.id),
              s = config ? state(config, e) : "unknown";
            return `<td><button data-date="${d}" title="${esc(h.name)}: ${s}" aria-label="Editar ${esc(h.name)} del ${d}">${s === "done" ? (e?.amount ? number(e.amount) : "✓") : s === "rest" ? "Descanso" : s === "partial" ? number(e.amount) : s === "miss" ? "No" : "—"}</button></td>`;
          })
          .join(
            "",
          )}<td>${esc((rows[`note/${d}`]?.value || "").slice(0, 60))}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></div><div class="legend">✓ Completado · Cantidad: progreso real · — Sin registrar · No: no realizado</div>`;
}
function heatmap(h, start, end) {
  const pad = (dateFrom(start).getDay() + 6) % 7;
  return `<div class="heatmap" aria-label="Mapa de constancia de ${esc(h.name)}">${"<span></span>".repeat(pad)}${dates(
    start,
    end,
  )
    .map((d) => {
      const config = at(h, d),
        e = entry(rows, d, h.id),
        s = d > today() ? "future" : config ? state(config, e) : "unknown";
      return `<button class="${s}" data-date="${d}" title="${esc(dateLabel(d))}: ${s === "done" ? "completado" : s === "rest" ? "descanso" : s === "miss" ? "no realizado" : s === "partial" ? "parcial" : "sin registrar"}" aria-label="${esc(dateLabel(d))}: ${s}" ${d > today() ? "disabled" : ""}></button>`;
    })
    .join(
      "",
    )}</div><div class="legend"><span><i></i>Completado</span><span><i class="blank"></i>Sin registrar</span><span><i class="miss"></i>No realizado</span><span><i class="rest"></i>Descanso</span></div>`;
}
function progressView() {
  const hs = habits(),
    start = shift(today(), 1 - period),
    sum = hs.reduce(
      (a, h) => {
        const s = stats(h, rows, start, today());
        a.done += s.done;
        a.known += s.known;
        a.total += s.total;
        return a;
      },
      { done: 0, known: 0, total: 0 },
    );
  const chart = Array.from({ length: 8 }, (_, i) => {
    const w = shift(monday(today()), (i - 7) * 7);
    const end = shift(w, 6) > today() ? today() : shift(w, 6);
    return { w, n: hs.reduce((a, h) => a + stats(h, rows, w, end).done, 0) };
  });
  const max = Math.max(1, ...chart.map((x) => x.n));
  return `<div class="topline"><span>LA PERSPECTIVA LO CAMBIA TODO</span><span class="pill">TU PROGRESO, A TU MANERA</span></div><h1>Mira cuánto has avanzado.</h1><p class="subtitle">La constancia se ve mejor con un poco de perspectiva.</p><div class="periods">${[7, 30, 90, 365].map((p) => `<button class="small-btn ${period === p ? "active" : ""}" data-period="${p}">${p} días</button>`).join("")}</div><div class="stats-grid"><div class="panel"><span class="big-number">${sum.done}</span><p>Objetivos diarios cumplidos</p></div><div class="panel"><span class="big-number">${sum.total ? Math.round((sum.known / sum.total) * 100) : 0}%</span><p>Cobertura de registros</p></div><div class="panel"><span class="big-number">${hs.filter((h) => !h.archived).length}</span><p>Hábitos activos</p></div></div><div class="panel"><h3>Tus últimas 8 semanas</h3><div class="chart">${chart.map((x) => `<div><span>${x.n}</span><i style="height:${(x.n / max) * 95}px"></i><span>${dateFrom(x.w).toLocaleDateString("es", { day: "numeric", month: "short" })}</span></div>`).join("")}</div><p class="quiet">Objetivos diarios cumplidos. La semana actual está en curso.</p></div><div class="section-title"><h2>Hábito a hábito</h2><small>Abre una tarjeta para ver el detalle</small></div>${hs
    .map((h) => {
      const s = stats(h, rows, start, today()),
        w = weekly(h, today());
      const current = at(h, today());
      return `<div class="panel habit-palette ${esc(h.color)}"><div class="section-title" style="margin-top:0"><button class="text-button" data-detail="${h.id}"><h3>${esc(h.name)} ${h.archived ? "· archivado" : ""}</h3></button><span class="pill">${current?.frequency === "weekly" ? `${w}/${current.times} esta semana` : `${s.rate ?? "—"}% completado`}</span></div>${heatmap(h, start, today())}<p>${s.done} completados · ${s.partial} parciales · ${s.coverage}% de cobertura ${s.amount ? `· ${number(s.amount)} ${esc(h.unit)} registrados` : ""}</p></div>`;
    })
    .join(
      "",
    )}<footer>Los días futuros no cuentan. Los descansos se excluyen del porcentaje diario. Los días sin registrar se muestran como desconocidos; la cobertura indica cuánto sabemos.</footer>`;
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
      ...entry(rows, selected, e.currentTarget.dataset.id),
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
    s = stats(h, rows, shift(today(), -29), today()),
    streak = streaks(h, rows, today()),
    previous = stats(h, rows, shift(today(), -59), shift(today(), -30));
  $("#detail-content").innerHTML =
    `<span class="eyebrow">TU HÁBITO EN PERSPECTIVA</span><h2>${esc(h.name)}</h2><p class="subtitle">Últimos 30 días · ${s.coverage}% de cobertura</p><div class="stats-grid"><div><strong class="big-number">${s.done}</strong><p>Completados</p></div><div><strong class="big-number">${streak.current}</strong><p>${streak.unit} de racha</p></div><div><strong class="big-number">${streak.best}</strong><p>Mejor racha</p></div></div>${h.frequency === "weekly" ? `<p>Semanas con objetivo cumplido: ${Object.values(s.weeks).filter((w) => w.done >= w.target).length}. Las semanas al borde del periodo pueden ser parciales.</p>` : `<p>Cumplimiento: ${s.rate ?? "—"}%. Periodo anterior: ${previous.rate ?? "—"}% (${previous.coverage}% de cobertura).</p>`}${detailPatterns(h)}<p class="quiet">${s.partial} parciales · ${s.rest} descansos · ${s.total - s.known} sin registrar${s.amount ? ` · ${number(s.amount)} ${esc(h.unit)} registrados` : ""}. Las marcas antiguas sin cantidad cuentan como completadas, pero no añaden unidades al total.</p><h3>Un año de pequeños pasos</h3><div style="margin-top:15px">${heatmap(h, shift(today(), -364), today())}</div><button class="text-button" data-edit="${h.id}">Editar objetivo</button>`;
  $("#detail").showModal();
  $("#detail-content")
    .querySelectorAll("[data-date]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        selected = b.dataset.date;
        $("#detail").close();
        navigate("today");
      }),
    );
  $("#detail-content")
    .querySelector("[data-edit]")
    .addEventListener("click", () => editHabit(id));
}
function detailPatterns(h) {
  const start = shift(today(), -89),
    days = dates(start, today()).filter((d) => at(h, d) && !at(h, d).archived);
  const weekdays = ["L", "M", "X", "J", "V", "S", "D"].map((label, i) => {
    const eligible = days.filter(
      (d) =>
        (dateFrom(d).getDay() + 6) % 7 === i &&
        entry(rows, d, h.id)?.status !== "rest",
    );
    const done = eligible.filter((d) =>
      achieved(at(h, d), entry(rows, d, h.id)),
    ).length;
    return {
      label,
      total: eligible.length,
      done,
      rate: eligible.length ? Math.round((done / eligible.length) * 100) : 0,
    };
  });
  const minutes = days.reduce(
    (n, d) => n + (entry(rows, d, h.id)?.minutes || 0),
    0,
  );
  const activities =
    h.id === "exercise"
      ? days.reduce(
          (n, d) => n + exerciseSessions(entry(rows, d, h.id)).length,
          0,
        )
      : 0;
  const ratings = [0, 1, 2, 3].map(
    (r) => days.filter((d) => entry(rows, d, h.id)?.rating === r).length,
  );
  return `<h3>Tu ritmo por día de la semana</h3><p class="quiet">Últimos 90 días. Incluye los días sin registrar; compáralo con tu cobertura.</p><div class="chart">${weekdays.map((w) => `<div><span>${w.rate}%</span><i style="height:${w.rate}px"></i><span>${w.label}</span></div>`).join("")}</div>${activities ? `<p>${number(activities)} actividades · ${number(minutes)} minutos registrados en los últimos 90 días.</p>` : minutes ? `<p>${number(minutes)} minutos de actividad registrados en los últimos 90 días.</p>` : ""}${h.kind === "rating" ? `<p class="quiet">Valoraciones (90 días): ${ratings.map((n, i) => `${["Hoy fue diferente", "En parte", "Según lo previsto", "Muy a gusto"][i]}: ${n}`).join(" · ")}. Son valoraciones personales, no una medida nutricional.</p>` : ""}`;
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
document
  .querySelectorAll("[data-view]")
  .forEach((b) => b.addEventListener("click", () => navigate(b.dataset.view)));
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
