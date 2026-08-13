"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { HistoryCard } from "@/components/history-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Generation, GenerationPage } from "@/lib/generation-types";

/**
 * 历史网格 + 分页。
 *
 * 用**「加载更多」按钮而不是无限滚动**：无限滚动在 375 宽下会让页脚永远够不着，
 * 而且 Playwright 里难以确定性断言"翻到了第二页"（要靠滚动触发 observer，时序
 * 不稳）。
 *
 * 首屏数据由 RSC 传进来，本组件只负责后续页——所以未登录用户根本走不到这里。
 */
export function HistoryGrid({ initial }: { initial: GenerationPage }) {
  const t = useTranslations("History");
  const [items, setItems] = useState<Generation[]>(initial.generations);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showFailed, setShowFailed] = useState(false);

  /**
   * 切换"显示失败记录"：重查第一页。
   *
   * **必须重置游标。** 过滤条件变了之后，旧游标在新条件下没有意义——它记的是
   * "上一条是哪个时间点的哪一行"，而那一行在新条件下可能根本不在结果集里，
   * 于是接着翻会翻出一段既不属于旧列表也不属于新列表的记录。
   * （与 admin 用户表里 applied 那处是同一类问题。）
   */
  async function toggleFailed(next: boolean) {
    setShowFailed(next);
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/generations${next ? "?includeFailed=true" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const page: GenerationPage = await res.json();
      setItems(page.generations);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      // **带上当前的过滤条件。** 游标只在发它的那组条件下有意义；只带 cursor
      // 不带 includeFailed 的话，第二页会按默认条件（隐藏失败）从一个"包含失败"
      // 的位置往下翻，结果既漏行又可能重复。
      const q = new URLSearchParams({ cursor });
      if (showFailed) q.set("includeFailed", "true");
      const res = await fetch(`/api/generations?${q}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const page: GenerationPage = await res.json();
      // 用函数式更新：连点两次「加载更多」时，闭包里的 items 会是旧值，
      // 直接 setItems([...items, ...]) 会丢掉其中一页。
      setItems((prev) => [...prev, ...page.generations]);
      setCursor(page.nextCursor);
    } catch {
      // 不显示后端原文：那些 message 是英文的运维文案，四种语言的界面都会露出
      // 英文。走本地化的通用文案。
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  /**
   * 「显示失败记录」开关。**空态里也要渲染。**
   *
   * 早先这个组件在 items 为空时直接 return 一段"你还没生成过任何东西"。加了默认
   * 过滤之后那条路径就有了一个陷阱：一个只生成过失败记录的用户会看到"什么都没有"
   * 且**没有任何办法翻出来**——而他恰恰是最需要看到那些记录的人（他想确认自己
   * 没被扣钱）。所以开关抽出来、两个分支共用。
   */
  const toggle = (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {/* components/ui/ 里没有 checkbox，用原生元素（同生成页的 select/textarea）。 */}
      <input
        type="checkbox"
        className="size-4 accent-primary"
        data-testid="show-failed"
        checked={showFailed}
        disabled={loading}
        onChange={(e) => void toggleFailed(e.target.checked)}
      />
      {t("showFailed")}
    </label>
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        {toggle}
        {/* 空态文案分两种：默认视图下要点出"失败记录被藏起来了"，否则用户会以为
            自己真的什么都没生成过。开着开关还是空，那就是真的空。 */}
        <p className="text-muted-foreground">
          {showFailed ? t("empty") : t("emptySuccessOnly")}
        </p>
        {/* shadcn v4 基于 @base-ui/react，没有 asChild；<Button render={<Link/>}> 会给
            锚点强加 role="button"。所以用 Link + buttonVariants。 */}
        <Link href="/generate" className={buttonVariants()}>
          {t("emptyCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {toggle}
      {/* 375 宽下两列：单列会让翻一页要滚很久，三列的缩略图小到看不出画面。 */}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((g) => (
          <HistoryCard key={g.id} generation={g} />
        ))}
      </ul>

      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t("loadError")}
        </p>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button onClick={loadMore} disabled={loading}>
            {loading ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
