import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Narrow Road" })).toBeVisible();
});

test("loads the workbench without horizontal overflow", async ({ page }) => {
  await expect(page.getByLabel("Bản vẽ đường hẹp theo mét")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Mẫu đường/ })).toHaveValue("ngo-chu-l");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
});

test("plans, explains, and exposes playback for the L-shaped alley", async ({ page }) => {
  await page.getByRole("button", { name: "Tìm đường" }).click();
  await expect(page.getByText("Đã có quỹ đạo")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Tiến.*m\./).first()).toBeVisible();
  await expect(page.getByRole("slider", { name: "Vị trí phát lại" })).toBeEnabled();
  await expect(page.getByText("Khoảng hở min")).toBeVisible();
});

test("opens the command palette with keyboard and switches template", async ({ page }) => {
  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", { name: "Tìm lệnh" });
  await expect(search).toBeFocused();
  await search.fill("Cổng hẹp");
  await page.getByRole("button", { name: /Mở Cổng hẹp/ }).click();
  await expect(page.getByRole("combobox", { name: /Mẫu đường/ })).toHaveValue("cong-hep");
  await expect(page.getByRole("textbox", { name: "Tên kịch bản" })).toHaveValue("Cổng hẹp");
});

test("draws a wall and supports undo/redo", async ({ page }) => {
  await page.getByRole("button", { name: "Vẽ tường hoặc vật cản" }).click();
  const canvas = page.getByLabel("Bản vẽ đường hẹp theo mét").locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  await canvas.click({ position: { x: 60, y: 60 } });
  await canvas.click({ position: { x: 120, y: 60 } });
  await canvas.click({ position: { x: 120, y: 120 } });
  await page.getByRole("button", { name: "Hoàn tất hình đang vẽ" }).click();
  await expect(page.getByRole("button", { name: "Hoàn tác" })).toBeEnabled();
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(page.getByRole("button", { name: "Làm lại" })).toBeEnabled();
});

test("serves seeded templates, DB-first vehicle search, and scenario CRUD", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "API smoke test chỉ cần chạy một lần.");
  const templates = await request.get("/api/templates");
  expect(templates.ok()).toBe(true);
  expect(((await templates.json()) as { templates: unknown[] }).templates).toHaveLength(5);

  const search = await request.get("/api/vehicles/search?query=Hatchback%20nh%E1%BB%8F");
  expect(search.ok()).toBe(true);
  const searchPayload = (await search.json()) as { braveUsed: boolean; results: unknown[] };
  expect(searchPayload.braveUsed).toBe(false);
  expect(searchPayload.results).toHaveLength(1);

  const created = await request.post("/api/scenarios", {
    data: {
      name: "Playwright API",
      scene: {
        version: 1,
        name: "Playwright API",
        world: { unit: "m", gridSize: 0.1 },
        objects: [],
      },
    },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { scenario: { id: string } }).scenario.id;
  try {
    const fetched = await request.get(`/api/scenarios/${id}`);
    expect(fetched.ok()).toBe(true);
    expect(((await fetched.json()) as { scenario: { name: string } }).scenario.name).toBe(
      "Playwright API",
    );
  } finally {
    const removed = await request.delete(`/api/scenarios/${id}`);
    expect(removed.status()).toBe(204);
  }
});
