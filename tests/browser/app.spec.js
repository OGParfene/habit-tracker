import { test, expect } from "@playwright/test";
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
  await expect(page.locator("tbody tr")).toHaveCount(14);
  await page.locator("tbody tr").nth(1).locator("button").first().click();
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
  await expect(page.locator(".heatmap")).toHaveCount(5);
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
