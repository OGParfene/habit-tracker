import { habitChartData, habitReport, dateFrom } from "./core.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (n) => new Intl.NumberFormat("es").format(n);
const shortDate = (date) =>
  dateFrom(date).toLocaleDateString("es", { day: "numeric", month: "short" });
const fullDate = (date) =>
  dateFrom(date).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const label = (p) =>
  p.start === p.end
    ? fullDate(p.start)
    : dateFrom(p.start).getFullYear() === dateFrom(p.end).getFullYear()
      ? `${shortDate(p.start)} – ${fullDate(p.end)}`
      : `${fullDate(p.start)} – ${fullDate(p.end)}`;
const ratings = [
  "Hoy fue diferente",
  "En parte",
  "Según lo previsto",
  "Muy a gusto",
];
function pointDescription(point, series, h) {
  const range = label(point);
  if (!point.days) return `${range}: el hábito no estaba activo.`;
  if (point.value === null)
    return `${range}: ${point.rest === point.days ? "descanso" : point.legacy ? "cantidad no anotada en los registros antiguos" : h.kind === "number" ? "sin cantidad anotada" : "sin datos anotados"}.`;
  const measure =
    h.kind === "number"
      ? `${number(point.value)} ${h.unit} anotados`
      : `${point.value} ${point.value === 1 ? "día" : "días"} ${h.id === "exercise" ? "de entrenamiento" : point.value === 1 ? "completado" : "completados"}`;
  const target =
    point.target !== null
      ? ` Objetivo: ${number(point.target)} ${series.unit}${series.group === "day" ? " por día" : " por semana"}.`
      : "";
  return `${range}: ${measure}.${target}${point.missing ? ` ${point.missing} ${h.kind === "number" ? "días sin cantidad anotada" : "días sin registrar"}.` : ""}`;
}
function ratingChart(h, rows, from, to) {
  const r = habitReport(h, rows, from, to),
    total = r.ratings.reduce((sum, n) => sum + n, 0),
    radius = 42,
    circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = r.ratings
    .map((count, i) => {
      const length = total ? (count / total) * circumference : 0;
      const segment = length
        ? `<circle class="rating-segment tone-${i}" cx="62" cy="62" r="${radius}" fill="none" stroke-width="12" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 62 62)"/>`
        : "";
      offset += length;
      return segment;
    })
    .join("");
  return `<figure class="habit-visual rating-visual" data-chart="ratings"><figcaption>Cómo has valorado tus días</figcaption><div class="rating-chart-layout"><svg viewBox="0 0 124 124" role="img" aria-label="${total} valoraciones registradas de ${esc(h.name)}"><circle cx="62" cy="62" r="42" fill="none" stroke="#efedf3" stroke-width="12"/>${segments}<text x="62" y="62" text-anchor="middle" class="donut-total">${total}</text><text x="62" y="78" text-anchor="middle" class="donut-caption">${total === 1 ? "valoración" : "valoraciones"}</text></svg><div class="rating-chart-legend">${ratings.map((rating, i) => `<button type="button" data-chart-info="${esc(`${rating}: ${r.ratings[i]} ${r.ratings[i] === 1 ? "día" : "días"}${total ? ` de ${total} ${total === 1 ? "valoración" : "valoraciones"}` : ""}.`)}"><i class="tone-${i}"></i><span>${rating}</span><strong>${r.ratings[i]}</strong></button>`).join("")}</div></div><p class="chart-readout" role="status" aria-live="polite">${total ? "Solo se representan las valoraciones anotadas. Los días sin registrar quedan fuera del círculo." : "El gráfico se completará cuando anotes tu primera valoración."}</p></figure>`;
}
export function habitChart(h, rows, from, to) {
  if (h.kind === "rating") return ratingChart(h, rows, from, to);
  const series = habitChartData(h, rows, from, to),
    { points, group } = series;
  const plot = {
    width: 400,
    height: 166,
    left: 35,
    right: 388,
    top: 19,
    bottom: 128,
  };
  const maxValue = Math.max(
    1,
    ...points.flatMap((p) => [p.value ?? 0, p.target ?? 0]),
  );
  const magnitude = 10 ** Math.floor(Math.log10(maxValue)),
    maximum = Math.ceil(maxValue / magnitude) * magnitude;
  const y = (n) => plot.bottom - (n / maximum) * (plot.bottom - plot.top),
    step = (plot.right - plot.left) / Math.max(1, points.length),
    barWidth = Math.min(25, step * 0.64);
  const title =
    h.kind === "number"
      ? `${h.id === "reading" ? "Tiempo de lectura" : h.id === "steps" ? "Pasos anotados" : `Cantidad · ${h.unit}`} ${group === "day" ? "por día" : group === "week" ? "por semana" : "por mes"}`
      : `${h.id === "exercise" ? "Días de entrenamiento" : "Días completados"} ${group === "day" ? "en el periodo" : group === "week" ? "por semana" : "por mes"}`;
  const hasTarget = points.some((p) => p.target !== null),
    hasData = points.some((p) => p.value !== null);
  const grid = [...new Set([0, Math.floor(maximum / 2), maximum])]
    .map((value) => {
      const position = y(value);
      return `<line x1="${plot.left}" x2="${plot.right}" y1="${position}" y2="${position}" class="plot-grid"/><text x="${plot.left - 7}" y="${position + 3}" text-anchor="end" class="plot-label">${new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text>`;
    })
    .join("");
  const bars = points
    .map((point, i) => {
      const x = plot.left + step * (i + 0.5),
        top = point.value === null ? plot.bottom : y(point.value),
        height = Math.max(2, plot.bottom - top),
        description = pointDescription(point, series, h);
      return `<g class="chart-point" tabindex="0" role="button" data-chart-info="${esc(description)}" aria-label="${esc(description)}"><title>${esc(description)}</title><rect class="chart-hit-area" x="${plot.left + step * i}" y="${plot.top - 5}" width="${step}" height="${plot.bottom - plot.top + 13}" fill="transparent"/>${point.value === null ? `<circle class="chart-missing" cx="${x}" cy="${plot.bottom - 2}" r="2.7"/>` : `<rect class="chart-bar" x="${x - barWidth / 2}" y="${point.value === 0 ? plot.bottom - 2 : top}" width="${barWidth}" height="${height}" rx="${Math.min(3, barWidth / 3)}"/>`}${point.target !== null ? `<line x1="${x - step / 2}" x2="${x + step / 2}" y1="${y(point.target)}" y2="${y(point.target)}" class="plot-target"/>` : ""}</g>`;
    })
    .join("");
  const indices = [
    ...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
  ];
  const axis = indices
    .map((i) => {
      const x =
        i === 0
          ? plot.left
          : i === points.length - 1
            ? plot.right
            : plot.left + step * (i + 0.5);
      return `<text x="${x}" y="153" text-anchor="${i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}" class="plot-label">${group === "month" ? dateFrom(points[i].start).toLocaleDateString("es", { month: "short", year: "2-digit" }) : shortDate(points[i].start)}</text>`;
    })
    .join("");
  const defaultDescription = hasData
    ? "Toca o enfoca una barra para ver su fecha y su dato."
    : "Todavía no hay datos para dibujar barras en este periodo.";
  return `<figure class="habit-visual" data-chart="bars" data-group="${group}"><figcaption>${esc(title)}</figcaption><svg class="habit-bar-chart" viewBox="0 0 ${plot.width} ${plot.height}" role="group" aria-label="${esc(title)}: ${esc(h.name)}">${grid}${bars}${axis}</svg><div class="chart-key"><span><i class="key-bar"></i>${esc(h.kind === "number" ? series.unit : "Días completados")} ${group === "day" ? (h.kind === "number" ? "anotados" : "") : `por ${group === "week" ? "semana" : "mes"}`}</span>${hasTarget ? '<span><i class="key-target"></i>Objetivo</span>' : ""}<span><i class="key-missing"></i>Sin ${h.kind === "number" ? "cantidad" : "registro"}</span></div><p class="chart-readout" role="status" aria-live="polite">${defaultDescription}</p>${group !== "day" ? `<p class="chart-caveat">${h.kind === "number" ? "Cada barra suma únicamente las cantidades anotadas." : "Cada barra cuenta días completados, aunque registraras varias actividades."} El primer y el último bloque pueden contener menos días.</p>` : ""}<details class="chart-data-table"><summary>Ver datos en tabla</summary><div><table><thead><tr><th>Fechas</th><th>${esc(series.unit)}</th><th>Días con dato</th></tr></thead><tbody>${points.map((p) => `<tr><td>${esc(label(p))}</td><td>${p.value === null ? "Sin datos" : number(p.value)}</td><td>${p.known} de ${p.days}</td></tr>`).join("")}</tbody></table></div></details></figure>`;
}
export function bindChartInteractions(root = document) {
  root.querySelectorAll("[data-chart-info]").forEach((el) => {
    const show = () => {
      const figure = el.closest("figure");
      figure
        .querySelectorAll(".selected-point")
        .forEach((node) => node.classList.remove("selected-point"));
      el.classList.add("selected-point");
      figure.querySelector(".chart-readout").textContent = el.dataset.chartInfo;
    };
    el.addEventListener("click", show);
    el.addEventListener("focus", show);
    if (el.tagName.toLowerCase() === "g")
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          show();
        }
      });
  });
}
