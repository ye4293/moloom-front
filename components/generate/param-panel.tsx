"use client";

import { useTranslations } from "next-intl";
import { ModelSelector } from "@/components/generate/model-selector";
import { ReferencePicker, type RefImage } from "@/components/generate/reference-picker";
import { Button } from "@/components/ui/button";
import type { RejectReason } from "@/lib/reference-images";
import { ASPECT_RATIOS, type ImageModel } from "@/lib/generation-types";

export function ParamPanel({
  models,
  modelId,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  prompt,
  onPromptChange,
  onSubmit,
  pending,
  isPublic,
  onIsPublicChange,
  refImages,
  refRejected,
  refBusy,
  refDisabledReason,
  onAddRefImages,
  onRemoveRefImage,
  onRetryRefImage,
}: {
  models: readonly ImageModel[];
  modelId: string;
  onModelChange: (id: string) => void;
  aspectRatio: string;
  onAspectRatioChange: (r: string) => void;
  prompt: string;
  onPromptChange: (p: string) => void;
  onSubmit: () => void;
  pending: boolean;
  isPublic: boolean;
  onIsPublicChange: (v: boolean) => void;
  refImages: RefImage[];
  refRejected: { reason: RejectReason; count: number }[];
  /** 还有图在压缩或上传。生成按钮据此禁用（理由见 workbench 的 refBusy 注释）。 */
  refBusy: boolean;
  refDisabledReason: "unsupported" | "storage" | null;
  onAddRefImages: (files: File[]) => void;
  onRemoveRefImage: (id: string) => void;
  onRetryRefImage: (id: string) => void;
}) {
  const t = useTranslations("Generate");
  const model = models.find((m) => m.id === modelId) ?? models[0];

  return (
    <form
      // 手机上占满宽度、分隔线走下边框（因为结果区在下方而不是右侧）；
      // ≥768px 恢复成原来的 240px 定宽左列 + 右分隔线，桌面端一像素未动。
      className="flex shrink-0 flex-col gap-4 border-b bg-muted/30 p-4 md:w-60 md:border-r md:border-b-0"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <ModelSelector models={models} value={modelId} onChange={onModelChange} disabled={pending} />

      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">{t("aspectRatio")}</span>
        <div className="flex gap-1.5">
          {/* 比例本身（"1:1"、"16:9"）是通用记法，各语言一致，不进词条。 */}
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={pending}
              aria-pressed={aspectRatio === r}
              onClick={() => onAspectRatioChange(r)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                aspectRatio === r ? "border-foreground font-medium" : "border-input"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <ReferencePicker
        images={refImages}
        disabled={pending || refDisabledReason !== null}
        disabledReason={refDisabledReason}
        onAdd={onAddRefImages}
        onRemove={onRemoveRefImage}
        onRetry={onRetryRefImage}
        rejected={refRejected}
      />

      {/*
        `mt-auto` 把 prompt 与生成按钮锚在参数列底部——只在参数列是**整列满高**时
        才成立。手机上参数面板变成横向一条、高度由内容决定，`mt-auto` 会把剩余空间
        全塞进这里，在 prompt 上方留下一大片空白并把按钮推下去。所以限定 md 以上生效。
      */}
      <div className="space-y-2 border-t pt-4 md:mt-auto">
        <label htmlFor="prompt" className="sr-only">
          {t("promptLabel")}
        </label>
        <textarea
          id="prompt"
          data-testid="prompt-input"
          rows={3}
          required
          maxLength={2000}
          disabled={pending}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={t("promptPlaceholder")}
          className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
        />
        <div className="flex items-center gap-2">
          {/*
            refBusy 也要禁用。**这条防的是"付了钱拿到忽略了参考图的结果"**：
            提交时只带已经拿到键的那些，所以在上传完成之前点生成，用户会按图生图的
            预期付费、拿到一张少了参考图的图，而没有任何地方提示发生了这件事。
          */}
          <Button
            type="submit"
            className="flex-1"
            disabled={pending || refBusy || !prompt.trim()}
          >
            {pending ? t("submitPending") : t("submit", { credits: model.credits })}
          </Button>
          <button
            type="button"
            disabled={pending}
            aria-pressed={isPublic}
            aria-label={isPublic ? t("visibilityPublic") : t("visibilityPrivate")}
            title={isPublic ? t("visibilityPublic") : t("visibilityPrivate")}
            onClick={() => onIsPublicChange(!isPublic)}
            className="rounded-md border border-input px-2 py-1.5 text-sm"
          >
            {isPublic ? "🔓" : "🔒"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {isPublic ? t("visibilityPublic") : t("visibilityPrivate")}
        </p>
      </div>
    </form>
  );
}
