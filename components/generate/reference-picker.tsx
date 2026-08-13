"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import {
  MAX_REFERENCE_IMAGES,
  type RejectReason,
} from "@/lib/reference-images";

/**
 * 一张参考图在界面上的状态。
 *
 * `previewUrl` 来自 `URL.createObjectURL(file)` —— **不是** R2 的地址。上传接口
 * 刻意只返回不透明的对象键（理由见后端 internal/handler/uploads.go），而缩略图
 * 用本地 blob URL 就够了，还顺带让预览在上传完成之前就能显示。
 */
export type RefImage = {
  /** 本地唯一 id，用于 React key 与删除定位。 */
  id: string;
  previewUrl: string;
  /** 上传成功后后端分配的对象键；未完成时为 null。 */
  key: string | null;
  status: "compressing" | "uploading" | "done" | "error";
  /** 失败时的原因码，用于查词条；重试用得到原 File。 */
  error?: "upload" | "compress" | RejectReason;
  file: File;
};

/**
 * 参考图选择器。
 *
 * **布局刻意压得很矮：单行 40px 缩略图 + `overflow-x-auto`。**
 * `e2e/generate.spec.ts` 的 `expectGenerateButtonAboveFold` 有三条硬断言，其中一条是
 * "生成按钮底边必须在首屏内"，而 375×667 下参数面板与顶栏已经占掉约 419px。
 * 多行网格（8 张 2 行）会再吃掉近 100px，把按钮推到折叠线附近；单行只占约 48px。
 *
 * 内层 `overflow-x-auto` 不影响那条断言：它比较的是 `document.scrollWidth` 与
 * `window.innerWidth`，容器内部的横向滚动不会撑大文档。
 */
export function ReferencePicker({
  images,
  disabled,
  disabledReason,
  onAdd,
  onRemove,
  onRetry,
  rejected,
}: {
  images: RefImage[];
  disabled: boolean;
  /** 模型不支持图生图，或本部署没配对象存储。 */
  disabledReason: "unsupported" | "storage" | null;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  /** 上一次选择里被拒的项，按原因聚合。 */
  rejected: { reason: RejectReason; count: number }[];
}) {
  const t = useTranslations("Generate");
  const inputRef = useRef<HTMLInputElement>(null);
  const full = images.length >= MAX_REFERENCE_IMAGES;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("reference")}</span>
        {images.length > 0 && (
          <span className="text-xs text-muted-foreground" data-testid="reference-count">
            {t("referenceCount", { count: images.length, max: MAX_REFERENCE_IMAGES })}
          </span>
        )}
      </div>

      {/*
        原生 file input 藏起来、用按钮触发。仓库没有自定义 file 控件，而原生控件的
        默认样式在 240px 宽的参数列里会把文件名撑出去（既有实现就有这个问题）。
        input 本身保留在 DOM 里且可被 setInputFiles 定位 —— e2e 靠它塞文件。
      */}
      <input
        ref={inputRef}
        id="reference"
        data-testid="reference-input"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || full}
        className="sr-only"
        onChange={(e) => {
          onAdd(Array.from(e.target.files ?? []));
          // 清空 value，否则连续两次选同一个文件时 change 不触发。
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => inputRef.current?.click()}
          data-testid="reference-add"
          className="rounded-md border border-input px-2 py-1 text-xs disabled:opacity-50"
        >
          {t("referenceAdd")}
        </button>
        {full && <span className="text-xs text-muted-foreground">{t("referenceFull")}</span>}
      </div>

      {images.length > 0 && (
        // 单行横向滚动。理由见组件注释：多行会顶掉折叠线断言。
        <ul className="flex gap-2 overflow-x-auto pb-1" data-testid="reference-thumbs">
          {images.map((img) => (
            <li key={img.id} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL 不能过 next/image */}
              <img
                src={img.previewUrl}
                alt=""
                data-testid="reference-thumb"
                className={`size-10 rounded border border-input object-cover ${
                  img.status === "done" ? "" : "opacity-50"
                }`}
              />
              {img.status === "error" ? (
                // 失败的那张就地可重试。**不自动重试**：上传失败多半是图太大或格式
                // 不对，自动重试只会把同一个失败重复一遍，还让人以为在加载。
                <button
                  type="button"
                  onClick={() => onRetry(img.id)}
                  title={t("referenceRetry")}
                  data-testid="reference-retry"
                  className="absolute inset-0 flex items-center justify-center rounded bg-danger-tint text-xs text-danger"
                >
                  ↻
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRemove(img.id)}
                  title={t("referenceRemove")}
                  data-testid="reference-remove"
                  className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border border-input bg-background text-[10px] leading-none"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
        提示文案。**必须提到透明通道会丢** —— 统一转 JPEG 是为了把手机照片压进
        请求体上限（见 lib/reference-images.ts），代价是 PNG 的透明区域变成白底。
        不说的话，一个传透明 logo 的用户会得到一个白底结果而看不出为什么。
      */}
      {disabledReason === "unsupported" && (
        <p className="text-xs text-muted-foreground">{t("noImageToImage")}</p>
      )}
      {disabledReason === "storage" && (
        <p className="text-xs text-muted-foreground" data-testid="reference-unavailable">
          {t("referenceUnavailable")}
        </p>
      )}
      {disabledReason === null && (
        <p className="text-xs text-muted-foreground">
          {t("referenceHint", { max: MAX_REFERENCE_IMAGES })}
        </p>
      )}

      {/*
        被拒的选择要**说出来**，不能静默丢弃：用户选了 10 张只进了 8 张、
        或者混进一个 HEIC 被跳过，界面上没有说明会让人以为功能坏了、反复重试。
      */}
      {rejected.map(({ reason, count }) => (
        <p key={reason} role="alert" className="text-xs text-danger" data-testid="reference-rejected">
          {reason === "tooMany"
            ? t("referenceTooMany", { max: MAX_REFERENCE_IMAGES })
            : t("referenceUnsupportedType", { count })}
        </p>
      ))}

      {images.some((i) => i.status === "error") && (
        <p role="alert" className="text-xs text-danger" data-testid="reference-upload-failed">
          {t("referenceUploadFailed", {
            count: images.filter((i) => i.status === "error").length,
          })}
        </p>
      )}
    </div>
  );
}
