import { test, expect } from "@playwright/test";

test("E2E: 統合モード - AI分析 → 結果表示", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Value Simulator")).toBeVisible();

  // Fill description textarea
  const textarea = page.locator("textarea");
  await textarea.fill("通勤時間を有効活用するオーディオブック。月額980円で聴き放題。");

  // AI analysis
  await page.getByRole("button", { name: /AI/ }).click();

  // Should show results (fallback mode since no API key)
  await expect(page.getByText("総採用者数")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("ODIスコア")).toBeVisible();
});

test("E2E: 統合モード - パラメータ変更して再実行", async ({ page }) => {
  await page.goto("/");

  // Fill description and run AI analysis
  const textarea = page.locator("textarea");
  await textarea.fill("通勤時間を有効活用するオーディオブック");
  await page.getByRole("button", { name: /AI/ }).click();

  // Wait for AI inference result
  await expect(page.getByText("AI推論結果")).toBeVisible({ timeout: 30000 });

  // Parameters should be prefilled - service name input should be visible
  await expect(page.locator('input[aria-label="サービス名"]')).toBeVisible();

  // Run simulation with overridden params
  await page.getByRole("button", { name: /再実行/ }).click();

  // Should show results
  await expect(page.getByText("総採用者数")).toBeVisible({ timeout: 30000 });
});

test("E2E: 統合モード - 詳細設定トグル", async ({ page }) => {
  await page.goto("/");

  // Fill description and run AI analysis
  const textarea = page.locator("textarea");
  await textarea.fill("テストサービス");
  await page.getByRole("button", { name: /AI/ }).click();

  // Wait for inference result
  await expect(page.getByText("AI推論結果")).toBeVisible({ timeout: 30000 });

  // Advanced settings should be hidden by default
  await expect(page.getByText("ターゲットユーザー")).not.toBeVisible();

  // Open advanced settings
  await page.getByText("詳細設定").click();
  await expect(page.getByText("ターゲットユーザー")).toBeVisible();
  await expect(page.getByText("カテゴリ")).toBeVisible();
  await expect(page.getByText("価格モデル")).toBeVisible();
  await expect(page.getByText("競合の存在")).toBeVisible();
});

