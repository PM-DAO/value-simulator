import { test, expect } from "@playwright/test";

const NOTION_DESCRIPTION = `Notion（ノーション）は、仕事や個人の情報を1つに集約できるクラウド型のワークスペースツールです。メモ・ドキュメント作成、タスク・プロジェクト管理、データベース（表）や社内Wiki、Webページ公開まで、バラバラなアプリでやっていたことを全部Notionの「ページ」と「データベース」にまとめて扱えます。

ブロックという部品を組み合わせてページを作る仕組みなので、簡単なメモから本格的なマニュアル、顧客リストやガントチャートまで、レイアウトや項目をかなり自由にカスタマイズできます。

個人なら「メモ・タスク・読書ログ・家計簿・旅行計画」などを一元管理するノートアプリ的な使い方、チームなら「社内Wiki・議事録・プロジェクト管理ボード・ナレッジベース」として使うケースが多いです。

最近はNotion AIやエージェント機能が強化されていて、ページ要約、文章の書き直し、タスク整理、社内ナレッジのQ&Aなども自動でやってくれる「AI付きワークスペース」という位置づけになっています。`;

const DIR = "../screenshots";

/** Helper: scroll so a text-matching element's top is at viewport top */
async function scrollToText(page: any, text: string, offsetY = 0) {
  await page.evaluate(([t, oy]: [string, number]) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent?.includes(t)) {
        const el = node.parentElement;
        if (el) {
          const rect = el.getBoundingClientRect();
          window.scrollTo(0, window.scrollY + rect.top - oy);
          return;
        }
      }
    }
  }, [text, offsetY]);
  await page.waitForTimeout(400);
}

test.describe("Notion Screenshots", () => {
  test.setTimeout(180_000);

  test("Take all screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByText("Value Simulator")).toBeVisible();

    // 01: Landing
    await page.screenshot({ path: `${DIR}/01_landing.png` });

    // Fill form
    await page.locator("textarea").fill(NOTION_DESCRIPTION);
    await page.locator("#period-select").selectOption("3years");
    await page.locator("#market-size-select").selectOption("medium");
    // 02: Input filled
    await page.screenshot({ path: `${DIR}/02_input.png` });

    // Run AI analysis
    await page.getByRole("button", { name: /AI/ }).click();
    await expect(page.getByText("総採用者数")).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(1000);

    // 03: Top of results
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/03_results_top.png` });

    // 04: AI推論結果
    await scrollToText(page, "AI推論結果", 10);
    await page.screenshot({ path: `${DIR}/04_ai_detail.png` });

    // 05: Funnel bar + stats overview
    await scrollToText(page, "ファネル分布", 10);
    await page.screenshot({ path: `${DIR}/05_funnel.png` });

    // 06: Funnel progression area chart
    await scrollToText(page, "ファネル推移", 10);
    await page.screenshot({ path: `${DIR}/06_funnel_area.png` });

    // 07: Agent table
    await scrollToText(page, "エージェント一覧", 10);
    await page.screenshot({ path: `${DIR}/07_agents.png` });

    // --- Now find absolute positions of dashboard elements ---
    const positions = await page.evaluate(() => {
      const results: Record<string, number> = {};
      const targets = [
        ["summary", "総採用者数"],
        ["scurve", "累積採用者数（S字カーブ）"],
        ["bell", "日次新規採用者数"],
        ["rogers", "ロジャーズカテゴリ"],
        ["revenue", "累積売上推移"],
        ["network", "ソーシャルグラフ"],
        ["scatter", "エージェント分布"],
      ];
      // Find last occurrence of each text (Dashboard section, not PersonaTab)
      for (const [key, text] of targets) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Text | null;
        let lastY = -1;
        while ((node = walker.nextNode() as Text | null)) {
          if (node.textContent?.includes(text)) {
            const el = node.parentElement;
            if (el) {
              const rect = el.getBoundingClientRect();
              lastY = window.scrollY + rect.top;
            }
          }
        }
        if (lastY >= 0) results[key] = lastY;
      }
      return results;
    });

    console.log("Element positions:", positions);

    // 08: Summary cards (scroll to summary cards position)
    if (positions.summary) {
      await page.evaluate((y: number) => window.scrollTo(0, y - 20), positions.summary);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/08_summary.png` });
    }

    // 09: S-curve + Bell curve
    if (positions.scurve) {
      await page.evaluate((y: number) => window.scrollTo(0, y - 20), positions.scurve);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/09_scurve_bell.png` });
    }

    // 10: Rogers + Revenue
    if (positions.rogers) {
      await page.evaluate((y: number) => window.scrollTo(0, y - 20), positions.rogers);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/10_rogers_revenue.png` });
    }

    // 11: Network graph
    if (positions.network) {
      await page.evaluate((y: number) => window.scrollTo(0, y - 20), positions.network);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${DIR}/11_network.png` });
    }

    // 12: Agent scatter
    if (positions.scatter) {
      await page.evaluate((y: number) => window.scrollTo(0, y - 20), positions.scatter);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/12_scatter.png` });
    }

    // 13: Full page
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/13_full.png`, fullPage: true });
  });
});
