import { test, expect } from "@playwright/test";
import { defaults, localDate, shift, recordKey } from "../../core.js";
test("daily logging persists, undo works, numeric partial differs from completion", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Completar Creatina", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deshacer Creatina", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Completar Creatina", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Lectura en min", exact: true })
    .fill("5");
  await page
    .locator('[data-amount="reading"]')
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Completar Lectura", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("spinbutton", { name: "Lectura en min", exact: true }),
  ).toHaveValue("5");
  await page
    .getByRole("button", { name: "Completar Lectura", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deshacer Lectura", exact: true }),
  ).toBeVisible();
});
test("detail modal does not duplicate main click handlers; custom habits and historical editing work", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Creatina", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Completar Creatina", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deshacer Creatina", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ajustes", exact: false }).click();
  await page.getByRole("button", { name: "+ Añadir", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nombre", exact: true })
    .fill("Estirar");
  await page
    .getByRole("button", { name: "Guardar hábito", exact: true })
    .click();
  await page.getByRole("button", { name: "Hoy", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Completar Estirar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Historial", exact: false }).click();
  await expect(
    page.getByRole("region", { name: "Calendario del historial" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mes anterior", exact: true }).click();
  await page.getByRole("button", { name: "Editar día", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ir a hoy", exact: true }),
  ).toBeVisible();
});
test("legacy migration preserves original and stats render without errors", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "calendarData",
      JSON.stringify({
        "2025-01-01": { steps: true, exercise: true, sports: ["Tenis"] },
      }),
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Progreso", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Mira cuánto has avanzado." }),
  ).toBeVisible();
  await expect(page.locator(".progress-card")).toHaveCount(5);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("calendarData"))["2025-01-01"].steps,
      ),
    )
    .toBe(true);
});
test("responsive layouts and offline reload", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Completar Creatina", exact: true })
    .click();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Deshacer Creatina", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("several exercises persist after completion and can be removed or undone independently", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Completar Ejercicio", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Actividad", exact: true })
    .selectOption("Fuerza");
  await page.getByLabel("Duración · opcional", { exact: true }).fill("35");
  await page
    .getByRole("button", { name: "+ Añadir ejercicio", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deshacer Ejercicio", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Actividad", exact: true })
    .selectOption("Cardio");
  await page.getByLabel("Duración · opcional", { exact: true }).fill("20");
  await page
    .getByRole("button", { name: "+ Añadir ejercicio", exact: true })
    .click();
  await expect(page.locator(".session-list li")).toHaveCount(2);
  await expect(page.locator(".session-heading")).toContainText(
    "55 min registrados",
  );
  await expect(page.locator(".hero h2")).toHaveText(
    "1 de 5 hábitos completados",
  );
  await page.reload();
  await expect(page.locator(".session-list li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Eliminar Fuerza de 35 minutos", exact: true })
    .click();
  await expect(page.locator(".session-heading")).toContainText(
    "20 min registrados",
  );
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(page.locator(".session-list li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Deshacer Ejercicio", exact: true })
    .click();
  await expect(page.locator(".session-list li")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Completar Ejercicio", exact: true }),
  ).toBeVisible();
});
test("legacy workouts and custom activity names survive export and import", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("rhythm-v2")) return;
    const d = new Date();
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    localStorage.setItem(
      "calendarData",
      JSON.stringify({ [key]: { exercise: true, sports: ["Tenis", "Boxeo"] } }),
    );
  });
  await page.goto("/");
  await expect(page.locator(".session-list li")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Actividad", exact: true })
    .selectOption("Otro");
  await page
    .getByLabel("Nombre del ejercicio", { exact: true })
    .fill("Bicicleta <suave>");
  await page
    .getByRole("button", { name: "+ Añadir ejercicio", exact: true })
    .click();
  await expect(page.locator(".session-list li")).toHaveCount(3);
  await expect(page.locator(".session-list")).toContainText(
    "Bicicleta <suave>",
  );
  await page.getByRole("button", { name: "Ajustes", exact: false }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar JSON", exact: true })
    .click();
  const download = await pending;
  const file = await download.path();
  await page.locator("#import").setInputFiles(file);
  await expect(page.locator("#toast")).toContainText("Copia combinada");
  await page.getByRole("button", { name: "Hoy", exact: false }).click();
  await expect(page.locator(".session-list li")).toHaveCount(3);
});
function reportFixture() {
  const date = localDate();
  const rows = Object.fromEntries(
    defaults(shift(date, -60)).map((h) => [
      `habit/${h.id}`,
      { value: h, updatedAt: new Date().toISOString() },
    ]),
  );
  for (const [d, id, value] of [
    [date, "reading", { status: "done", amount: 15 }],
    [shift(date, -10), "reading", { status: "done", amount: 30 }],
    [date, "steps", { status: "done", amount: 8200 }],
    [shift(date, -1), "steps", { status: "done", amount: 900 }],
    [
      date,
      "exercise",
      {
        status: "done",
        sessions: [
          { id: "one", sport: "Fuerza", minutes: 30 },
          { id: "two", sport: "Cardio", minutes: 15 },
        ],
        sports: ["Fuerza", "Cardio"],
        minutes: 45,
      },
    ],
  ])
    rows[recordKey(d, id)] = { value, updatedAt: new Date().toISOString() };
  return rows;
}
test("progress explains real quantities and individual details follow the selected period", async ({
  page,
}) => {
  await page.addInitScript(
    (rows) => localStorage.setItem("rhythm-v2", JSON.stringify(rows)),
    reportFixture(),
  );
  await page.goto("/#progress");
  await page.getByRole("button", { name: "7 días", exact: true }).click();
  const reading = page.locator('[data-progress-habit="reading"]');
  await expect(reading.locator(".progress-value")).toHaveText("15 min");
  await expect(reading).toContainText("Total anotado en 1 día");
  await expect(page.locator('[data-progress-habit="exercise"]')).toContainText(
    "2 actividades",
  );
  await expect(page.locator('[data-progress-habit="exercise"]')).toContainText(
    "45 min anotados",
  );
  await expect(page.locator("main")).not.toContainText("cobertura");
  await reading
    .getByRole("button", { name: "Ver detalle →", exact: true })
    .click();
  await expect(page.locator("#detail-content .progress-value")).toHaveText(
    "15 min",
  );
  await expect(page.locator("#detail-content")).toContainText("ÚLTIMOS 7 DÍAS");
  await expect(page.locator(".detail-breakdown")).toContainText(
    "Sin registrar",
  );
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "30 días", exact: true }).click();
  await expect(
    page.locator('[data-progress-habit="reading"] .progress-value'),
  ).toHaveText("45 min");
});
test("history previews days, edits one explicitly and returns without losing records", async ({
  page,
}) => {
  await page.addInitScript(
    (rows) => localStorage.setItem("rhythm-v2", JSON.stringify(rows)),
    reportFixture(),
  );
  await page.goto("/#history");
  await expect(page.locator(".day-records")).toContainText(
    "Fuerza · 30 min / Cardio · 15 min",
  );
  await page.getByRole("button", { name: "Editar día", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Lectura en min", exact: true })
    .fill("20");
  await page
    .locator('[data-amount="reading"]')
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Volver al historial", exact: true })
    .click();
  await expect(page.locator(".day-records")).toContainText(
    "20 min · objetivo cumplido",
  );
  await expect(page.locator(".day-records")).toContainText(
    "Fuerza · 30 min / Cardio · 15 min",
  );
  await page.locator(".calendar-dates button:not(:disabled)").first().click();
  await expect(page).toHaveURL(/#history$/);
  await expect(page.locator(".day-detail")).toBeVisible();
});
test("mobile form controls stay at least 16px without disabling manual zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const small = async () =>
    page
      .locator("input:not([type=checkbox]):not([type=radio]),select,textarea")
      .evaluateAll((elements) =>
        elements
          .filter(
            (el) =>
              el.getBoundingClientRect().width > 0 &&
              parseFloat(getComputedStyle(el).fontSize) < 16,
          )
          .map((el) => el.id || el.name),
      );
  expect(await small()).toEqual([]);
  const viewport = await page
    .locator("meta[name=viewport]")
    .getAttribute("content");
  expect(viewport).not.toMatch(/user-scalable=no|maximum-scale=1/);
  await page
    .getByRole("spinbutton", { name: "Lectura en min", exact: true })
    .fill("10");
  await page
    .locator('[data-amount="reading"]')
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Ajustes", exact: false }).click();
  expect(await small()).toEqual([]);
  await page.getByRole("button", { name: "+ Añadir", exact: true }).click();
  expect(await small()).toEqual([]);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Historial", exact: false }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
