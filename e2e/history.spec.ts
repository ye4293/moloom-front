import { test, expect, type Page } from "@playwright/test";

import { signUp } from "./accounts";

/**
 * 历史页的端到端覆盖。跑在**真实 Go 后端**上，后端须为 stub 模式
 * （不配 FLUX_API_KEY）。prompt 里带 `quick` 走 200 毫秒路径。
 *
 * 后端也**不会**配 R2（e2e 环境没有凭证），加上 stub 返回的是相对路径，
 * 所以这里生成出来的每一条都必然是 stored=false——「链接可能已失效」提示因此是
 * 可断言的，而它正好守住了 stored 字段从后端一路透到 UI 的完整链路。
 */

/** 生成按钮。文案是 `Generate ◆ 7`；顶栏那个 "Generate" 是 role=link，不会撞上。 */
function generateButton(page: Page) {
  return page.getByRole("button", { name: /^Generate/ });
}

/** 生成一张图并等它出图。 */
async function generateOnce(page: Page, prompt: string) {
  await page.goto("/generate");
  await page.getByTestId("prompt-input").fill(prompt);
  await generateButton(page).click();
  await expect(page.getByTestId("result-image")).toBeVisible({ timeout: 20_000 });
}

test("未登录访问 /history 跳登录", async ({ page }) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/login/);
});

test("生成一张后能在历史里看到它，并提示链接可能失效", async ({ page }) => {
  await signUp(page, "hist");
  await generateOnce(page, "quick cat on a roof");

  await page.goto("/history");
  await expect(page.getByAltText("quick cat on a roof")).toBeVisible();
  // e2e 后端没配 R2，必然未转存——提示必须出现。链路上任何一环漏了 stored，
  // 这条就会失败。
  await expect(page.getByTestId("temporary-link-warning").first()).toBeVisible();
});

test("失败的生成默认隐藏，但开关一开就能看到未扣次数", async ({ page }) => {
  // 这条原先断言的是"失败记录默认可见"。产品取舍改成默认隐藏之后，它**没有被删掉**，
  // 而是反转成钉住新契约的两端：
  //
  //   1. 默认视图里看不到失败记录（那是这次改动的目的）；
  //   2. **开关一开就必须完整可见，含「未扣次数」那句**——生成失败时用户第一反应
  //      是担心被扣钱，那句话是唯一能打消疑虑的东西。只测第 1 条的话，
  //      哪天有人把开关那条路一起删掉，不会有任何测试变红。
  await signUp(page, "hist-fail");

  await page.goto("/generate");
  await page.getByTestId("prompt-input").fill("fail on purpose");
  await generateButton(page).click();
  // 失败路径不出图，等失败态稳定（stub 的 fail 关键词是 800ms）。
  await expect(page.getByTestId("result-error")).toBeVisible({ timeout: 20_000 });

  await page.goto("/history");
  // 默认：看不到。用 toHaveCount(0) 而不是 not.toBeVisible()——后者对不存在的
  // 元素也通过，区分不出"渲染了但看不见"与"根本没渲染"。
  // 用 testid 而不是文案：getByText 是**大小写不敏感的子串匹配**，
  // getByText("Failed") 会匹配到开关自己的标签「Show failed attempts」。
  await expect(page.getByTestId("history-failed-card")).toHaveCount(0);
  await expect(page.getByText("No credits were charged.")).toHaveCount(0);
  // 而且空态要**主动说明**失败记录被藏起来了，否则一个只失败过的用户会以为
  // 自己什么都没生成过。
  await expect(page.getByText(/Failed attempts are hidden/i)).toBeVisible();

  // 开关一开：完整可见。
  await page.getByTestId("show-failed").check();
  await expect(page.getByTestId("history-failed-card")).toHaveCount(1);
  await expect(page.getByText("No credits were charged.").first()).toBeVisible();
});

test("切换开关会重置游标——不能拿旧列表的位置去翻新列表", async ({ page }) => {
  // **这条钉的是一个会漏记录的 bug。** 游标编码的是"上一条是哪个时间点的哪一行"，
  // 只在发它的那组过滤条件下有意义。切换开关后若沿用旧游标，接着翻会从"另一组条件下
  // 的某个位置"开始往下走，于是排在那之前的记录**全部被跳过**，而界面上看不出
  // 发生过这件事。
  //
  // 全程走**客户端** fetch：/history 首屏是 Server Component，page.route 拦不到
  // 它的服务端 fetch。从空历史开始，靠两次切换开关制造出"先后两个不同的游标"。
  await signUp(page, "hist-cursor");

  const seen: string[] = [];
  await page.route("**/api/generations*", async (route) => {
    const url = new URL(route.request().url());
    seen.push(url.search);
    const withFailed = url.searchParams.get("includeFailed") === "true";
    const cursor = url.searchParams.get("cursor");
    // 两种过滤条件下的游标**故意不同**，这样才看得出组件用了哪一个。
    // 带游标的请求返回 null（到底了），免得无限翻。
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generations: [
          {
            id: `${withFailed ? "f" : "d"}-${cursor ?? "p1"}`,
            model: "flux-2-max",
            prompt: "p",
            aspectRatio: "1:1",
            isPublic: false,
            status: "succeeded",
            creditsSpent: 7,
            createdAt: "2026-01-01T00:00:00Z",
            imageUrl: "/placeholder-generation.svg",
            stored: false,
          },
        ],
        // 永远给一个游标，让「加载更多」按钮一直在——本测试只在明确的时机点它。
        nextCursor: withFailed ? "CURSOR_FAILED" : "CURSOR_DEFAULT",
      }),
    });
  });

  await page.goto("/history");
  const loadMore = page.getByRole("button", { name: "Load more" });

  // 开：客户端重查第一页，拿到 CURSOR_FAILED。
  // **这一步本身就是一道守卫**——切换时不把响应里的游标存下来的话，
  // 「加载更多」按钮根本不会出现。
  await page.getByTestId("show-failed").check();
  await expect(loadMore).toBeVisible();

  // 开着的时候翻页：游标与过滤条件**都**要带对。
  seen.length = 0;
  await loadMore.click();
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0], `开着开关翻页时的请求是 ${seen[0]}`).toContain("cursor=CURSOR_FAILED");
  expect(
    seen[0],
    `开着开关翻页时没带 includeFailed（请求是 ${seen[0]}）——第二页会按默认条件返回，` +
      "于是「显示失败记录」只对第一页生效，往下翻就悄悄失效了",
  ).toContain("includeFailed=true");

  // 关：再查一次，这次拿到的是 CURSOR_DEFAULT。
  await page.getByTestId("show-failed").uncheck();
  await expect(loadMore).toBeVisible();

  seen.length = 0;
  await loadMore.click();
  await expect.poll(() => seen.length).toBe(1);
  expect(
    seen[0],
    `切换之后「加载更多」用的是 ${seen[0]}——应当是最后一次切换那个响应给的 ` +
      "CURSOR_DEFAULT，而不是上一组条件下的 CURSOR_FAILED。用错游标会整段跳过记录",
  ).toContain("cursor=CURSOR_DEFAULT");
  // 关掉开关之后不该再带 includeFailed，否则第二页仍然含失败记录。
  expect(seen[0]).not.toContain("includeFailed");
});

test("翻页不重不漏，最后一页 nextCursor 为 null", async ({ page }) => {
  await signUp(page, "hist-page");
  for (const p of ["quick one", "quick two", "quick three"]) {
    await generateOnce(page, p);
  }

  // 首屏默认 limit=20 会一次给完，所以分页语义直接打接口验证。
  // 用 page.request 而不是 request fixture：前者一定带上 page 的 httpOnly cookie。
  const first = await page.request.get("/api/generations?limit=2");
  expect(first.ok()).toBeTruthy();
  const firstPage = await first.json();
  expect(firstPage.generations).toHaveLength(2);
  expect(firstPage.nextCursor).toBeTruthy();

  const second = await page.request.get(
    `/api/generations?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
  );
  const secondPage = await second.json();
  expect(secondPage.generations).toHaveLength(1);
  expect(secondPage.nextCursor).toBeNull();

  const ids = [...firstPage.generations, ...secondPage.generations].map(
    (g: { id: string }) => g.id,
  );
  expect(new Set(ids).size, `两页之间有重复：${ids.join(",")}`).toBe(3);
});

test("没有下一页时不显示「加载更多」", async ({ page }) => {
  await signUp(page, "hist-more");
  await generateOnce(page, "quick alpha");

  // 默认 limit 是 20，一条一屏就给完了，按钮不该出现——无条件渲染「加载更多」
  // 会让用户点一个什么都不会发生的按钮。
  await page.goto("/history");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await expect(page.getByAltText("quick alpha")).toBeVisible();
});

test.describe("移动端（375×667）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("历史页在窄屏下两列且无横向溢出", async ({ page }) => {
    await signUp(page, "hist-m");
    await generateOnce(page, "quick mobile cat");

    await page.goto("/history");
    await expect(page.getByAltText("quick mobile cat")).toBeVisible();

    // 横向溢出是窄屏最常见也最难靠肉眼发现的回归：一个漏写 sm: 前缀的定宽
    // 在桌面端完全看不出来。
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      m.scrollWidth,
      `横向溢出：scrollWidth=${m.scrollWidth} > innerWidth=${m.innerWidth}`,
    ).toBeLessThanOrEqual(m.innerWidth);
  });
});
