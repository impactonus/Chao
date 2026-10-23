import { audioFixture } from "../audio-fixture.js";
import { test, expect } from "@playwright/test";
async function login(page, id = "admin") {
  await page.goto("/");
  await page.getByLabel("User ID", { exact: true }).fill(id);
  await page.getByLabel("Password", { exact: true }).fill("ChaoDemo2026!");
  await page.getByRole("button", { name: "Enter your workspace" }).click();
  await expect(
    page.getByRole("heading", {
      name: "A little challenge. A lot of possibility.",
    }),
  ).toBeVisible();
}
async function navigate(page, name, testInfo) {
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
test("admin workspace renders, navigates all tabs and fits the viewport", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(
    page.getByRole("heading", { name: "The daily brain sprint" }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/chao-${testInfo.project.name}.png`,
    fullPage: true,
  });
  for (const [tab, heading] of [
    ["Submit questions", "Good questions start here."],
    ["Review questions", "Help good questions shine."],
    ["Manage users", "A place for every curious mind."],
    ["Manage challenges", "Give curiosity a starting line."],
    ["Manage questions", "See the bigger picture."],
  ]) {
    await navigate(page, tab, testInfo);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test("player can submit an audio question, edit it, and sees only player navigation", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  await login(page, "player");
  await navigate(page, "Submit questions", testInfo);
  await page.getByRole("button", { name: "New question", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your question", exact: true })
    .fill(`What do you call frozen water? ${suffix}`);
  await page.getByLabel("The answer", { exact: false }).fill("ice");
  await page.locator("input[type=file]").setInputFiles({
    name: "explanation.wav",
    mimeType: "audio/wav",
    buffer: audioFixture(),
  });
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: `What do you call frozen water? ${suffix}`,
    }),
  ).toBeVisible();
  const card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: `What do you call frozen water? ${suffix}`,
    }),
  });
  await expect
    .poll(() => card.locator("audio").evaluate((a) => a.readyState))
    .toBeGreaterThan(0);
  await card.getByRole("button", { name: "Edit question" }).click();
  await page
    .getByRole("textbox", { name: "Your question", exact: true })
    .fill(`What is the name for frozen water? ${suffix}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: `What is the name for frozen water? ${suffix}`,
    }),
  ).toBeVisible();
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation").getByRole("button")).toHaveCount(2);
});
test("game shows character count and publishes a final score", async ({
  page,
}) => {
  await login(page);
  await page.locator(".hero-card .btn").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const result = page.getByRole("heading", {
    name: "A little wiser. Nicely played.",
  });
  if ((await result.count()) === 0) {
    await expect(page.getByText(/characters in the answer/)).toBeVisible();
    await page
      .getByRole("button", { name: "Finish now & submit score" })
      .click();
  }
  await expect(result).toBeVisible();
  await page.getByRole("button", { name: "Back to the leaderboard" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".rank-row").filter({ hasText: "Alex Morgan" }),
  ).toBeVisible();
});
