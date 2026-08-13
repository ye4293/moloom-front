import { useTranslations } from "next-intl";

import type { Generation } from "@/lib/generation-types";

/**
 * 单条历史记录，三态：
 *
 * 1. 成功且 `stored` —— 正常图，链接永久；
 * 2. 成功但 `!stored` —— 图 + 「链接可能已失效」。**必须显式提示**：不提示的话
 *    页面当下完全正常，一小时后变成坏图，用户无从判断是自己的网络还是我们弄丢
 *    了他的图；
 * 3. `failed` —— 灰格子 + 错误 + 「未扣除次数」。
 *
 *    **这一态默认不出现在列表里**：后端 GET /generations 默认过滤掉 failed，
 *    要靠历史页那个「显示失败记录」开关才拉得出来。改成默认隐藏是一次产品取舍——
 *    失败的灰格子在"看看我出过什么图"这个用途下是噪音。
 *
 *    但**这一态本身一个字都不能删**，理由与它当初被加进来时完全一样：用户看到
 *    "我明明生成过一张"却找不到，会怀疑被吞了钱，而这条记录恰恰证明没扣钱
 *    （creditsSpent: 0）。默认藏起来是为了让列表清爽，不是因为这条信息不重要——
 *    它只是从"总是在场"变成了"需要时一定找得到"。空态那句 `emptySuccessOnly`
 *    也是为此存在：它主动说明"失败记录被藏起来了"，免得一个只失败过的用户
 *    以为自己什么都没生成过。
 *
 * 用 <img> 而不是 next/image：图片来自运行期才知道的外部域（R2 自定义域，或降级
 * 时的上游 CDN），next/image 需要在 next.config.ts 里预先登记域名，而降级时的
 * 上游域名是不可枚举的。给 next/image 配 unoptimized 等于绕过它全部收益，只留
 * 配置负担。
 */
export function HistoryCard({ generation }: { generation: Generation }) {
  const t = useTranslations("History");

  if (generation.status === "failed") {
    return (
      <li
        data-testid="history-failed-card"
        className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-3"
      >
        <div className="flex aspect-square items-center justify-center rounded-md bg-recessed text-sm text-muted-foreground">
          {t("failedLabel")}
        </div>
        <p className="line-clamp-2 text-sm text-foreground">
          {generation.prompt}
        </p>
        <p className="text-xs text-muted-foreground">{t("notCharged")}</p>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <a
        href={generation.imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={t("openImage")}
        className="block overflow-hidden rounded-md"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={generation.imageUrl}
          alt={generation.prompt}
          loading="lazy"
          className="aspect-square w-full object-cover"
        />
      </a>
      <p className="line-clamp-2 text-sm text-foreground">
        {generation.prompt}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("creditsSpent", { count: generation.creditsSpent })}
      </p>
      {!generation.stored && (
        <p
          data-testid="temporary-link-warning"
          className="text-xs text-warning"
        >
          {t("temporaryLink")}
        </p>
      )}
    </li>
  );
}
