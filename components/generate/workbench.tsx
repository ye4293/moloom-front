"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ParamPanel } from "@/components/generate/param-panel";
import { ResultPanel } from "@/components/generate/result-panel";
import { InsufficientCreditsDialog } from "@/components/generate/insufficient-credits-dialog";
import type { RefImage } from "@/components/generate/reference-picker";
import {
  compressToDataURL,
  validateSelection,
  type RejectReason,
} from "@/lib/reference-images";
import { ERR_STORAGE_NOT_CONFIGURED } from "@/lib/backend";
import type { CreditBalance, Generation, ImageModel } from "@/lib/generation-types";

const ERR_INSUFFICIENT_CREDITS = 40001;
/** 覆盖最慢模型（约 3 分钟）并留余量。 */
const CLIENT_TIMEOUT_MS = 240_000;

export function Workbench({
  models,
  initialBalance,
}: {
  models: readonly ImageModel[];
  initialBalance: CreditBalance;
}) {
  const t = useTranslations("Generate");
  // 这里刻意用 next/navigation 的 useRouter 而不是 i18n/navigation 的：本组件只调
  // `router.refresh()`（刷新当前路由的 RSC），不做任何跳转，没有语言前缀问题。
  const router = useRouter();
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [prompt, setPrompt] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [pending, setPending] = useState(false);
  const [current, setCurrent] = useState<Generation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Extract<Generation, { status: "succeeded" }>[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [balance, setBalance] = useState<CreditBalance>(initialBalance);

  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [refRejected, setRefRejected] = useState<{ reason: RejectReason; count: number }[]>([]);
  // storageOff 一旦为真就不再变回：它代表"这个部署没配对象存储"，是配置事实而不是
  // 抖动。一次 50302 之后把入口关掉，比让用户对着一个必然失败的按钮反复点更好。
  const [storageOff, setStorageOff] = useState(false);

  const model = models.find((m) => m.id === modelId) ?? models[0];

  /**
   * 压缩 + 上传一张图，就地更新它的状态。
   *
   * **每张独立成败。** 传 5 张成功 3 张时，成功的那 3 张照常可用、失败的 2 张
   * 标红可重试 —— 不因为两张失败就阻止用户拿 3 张去生成，也不静默把失败的丢掉
   * （那会让用户以为参考图不起作用）。
   */
  async function uploadOne(id: string, file: File) {
    const patch = (p: Partial<RefImage>) =>
      setRefImages((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
    try {
      patch({ status: "compressing", error: undefined });
      const dataURL = await compressToDataURL(file);
      patch({ status: "uploading" });
      const res = await fetch("/api/uploads/reference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataURL }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.code === ERR_STORAGE_NOT_CONFIGURED) {
          // 后端没配 R2。这不是这一张图的问题，整个功能都不可用。
          setStorageOff(true);
          setRefImages([]);
          return;
        }
        patch({ status: "error", error: "upload" });
        return;
      }
      const { key } = (await res.json()) as { key: string };
      patch({ status: "done", key });
    } catch {
      // createImageBitmap 对损坏的文件会抛异常，网络层失败也走这里。
      patch({ status: "error", error: "compress" });
    }
  }

  function addRefImages(files: File[]) {
    const { accepted, rejected } = validateSelection(files, refImages.length);
    // 把被拒的按原因聚合，显示成一条而不是每个文件一条。
    const grouped = new Map<RejectReason, number>();
    for (const r of rejected) grouped.set(r.reason, (grouped.get(r.reason) ?? 0) + 1);
    setRefRejected([...grouped].map(([reason, count]) => ({ reason, count })));

    const fresh: RefImage[] = accepted.map((file) => ({
      // crypto.randomUUID 在所有目标浏览器上都有（https 或 localhost）。
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
      key: null,
      status: "compressing" as const,
      file,
    }));
    setRefImages((prev) => [...prev, ...fresh]);
    for (const img of fresh) void uploadOne(img.id, img.file);
  }

  function removeRefImage(id: string) {
    setRefImages((prev) => {
      const gone = prev.find((x) => x.id === id);
      // 撤销 blob URL，否则每选一次图就泄一份解码后的位图，选到第八张时移动端
      // 浏览器已经很吃力了。
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  function retryRefImage(id: string) {
    const img = refImages.find((x) => x.id === id);
    if (img) void uploadOne(id, img.file);
  }

  // 还有图在压缩或上传时禁止提交。
  //
  // **这条是防"付了钱拿到忽略了参考图的结果"。** 提交时只会带上已经拿到键的那些，
  // 所以在上传完成之前点生成，用户会按图生图的预期付费、拿到一张少了参考图的结果，
  // 而没有任何地方提示发生了这件事。
  const refBusy = refImages.some((i) => i.status === "compressing" || i.status === "uploading");

  async function refreshBalance() {
    try {
      const res = await fetch("/api/credits");
      if (res.ok) setBalance(await res.json());
    } catch {
      // 余额刷新失败不影响主流程，静默即可——顶栏会在下次导航时同步。
    }
    // 顶栏余额是 Server Component 渲染的，需要 refresh 才会更新。
    router.refresh();
  }

  async function onSubmit() {
    setError(null);
    setCurrent(null);
    setPending(true);
    try {
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: modelId,
          aspectRatio,
          isPublic,
          // 只带**已经拿到键**的那些，且保持用户排列的顺序——顺序对应上游的
          // input_image、input_image_2…。失败的那几张不带（生成按钮在还有
          // "上传中"时是禁用的，所以走到这里只剩 done 与 error 两种）。
          referenceKeys: refImages
            .filter((i) => i.status === "done" && i.key)
            .map((i) => i.key as string),
        }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.code === ERR_INSUFFICIENT_CREDITS) {
          setShowUpgrade(true);
        } else {
          // 同 auth-form：`body.message` 是后端的英文原文，不随界面语言变。
          // 真后端必须返回错误码，前端才能查词条翻译。见 §已知缺口。
          setError(body?.message ?? t("genericError"));
        }
        return;
      }

      const generation: Generation = await res.json();
      if (generation.status === "failed") {
        const model = models.find((m) => m.id === generation.model);
        // generation.error 同样是上游原文，只能原样嵌进本地化句式里。
        setError(t("failed", { error: generation.error, credits: model?.credits ?? 0 }));
      } else {
        setCurrent(generation);
        setRecent((r) => [generation, ...r].slice(0, 8));
      }
      await refreshBalance();
    } catch (e) {
      // fetch 只在网络层失败时 reject。不接住就是一条静默的 unhandled rejection：
      // 按钮闪一下恢复原样，用户完全看不出发生了什么（M1 登录表单踩过这个坑）。
      //
      // 超时文案**不能**说"次数未被扣除"：客户端 abort 时服务端的扣费早已提交，
      // 而 Handler 的 `sleep` 刻意不理 `req.signal`（那是对的——见设计 §2.2 风险一：
      // 真后端必须用脱离请求的 context），所以服务端会一路跑到成功且永不退款。
      // 次数确实被扣了。在 mock 里这条不可达（最长 90 秒 < 240 秒超时），但真后端
      // 最慢约 3 分钟、加上网络开销会越过 240 秒。这也是 §9 里 `/history` 优先级
      // 上升的直接原因——它是用户"确认这次到底扣没扣、图去哪了"的唯一途径。
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      setError(timedOut ? t("timeout") : t("networkError"));
    } finally {
      // 这里与认证表单不同：生成完成后**留在原页**，组件不会被卸载，
      // 所以必须复位 pending，否则按钮永久禁用。
      setPending(false);
    }
  }

  return (
    <>
      {/*
        用 flex-1 撑满 <main> 的剩余高度，**不要**写回 min-h-[calc(100vh-57px)]。
        那个 57px 是硬编码的顶栏高度，实际顶栏约 65px，于是容器比视口高，
        底部锚定的 prompt 与生成按钮被挤到折叠线以下——用户必须滚动才能点到
        主界面上最重要的按钮。链路是 html.h-full → body.min-h-full.flex-col
        → main.flex-1.flex-col → 这里 flex-1，全程没有魔法数字。

        手机（<768px）改成**纵向堆叠**，且顺序是"参数在上、结果在下"。

        为什么不是结果在上：手机上一屏只有约 667px，顶栏占掉约 100px。结果区自带
        min-h-[320px]，出图后更是最高 70vh——把它放在上面，prompt 与生成按钮就被推到
        第二屏甚至更远，用户每次生成都要先往下滚才能找到最重要的按钮。这正是本文件
        上一条注释里修掉的那个缺陷（生成按钮跌到折叠线以下）在移动端的翻版，而且
        e2e 里"出图后生成按钮底边仍在视口内"那条断言会直接挂掉。

        参数在上的代价是出图后结果在折叠线下方，需要向下滚一屏才看到——这个代价是
        可接受的：滚动去看一张刚生成的图是自然动作（用户知道自己在等图），而每次
        生成前都要先滚过一大片空白结果区去找按钮不是。
      */}
      <div className="flex flex-1 flex-col md:flex-row">
        <ParamPanel
          models={models}
          modelId={modelId}
          onModelChange={setModelId}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={onSubmit}
          pending={pending}
          isPublic={isPublic}
          onIsPublicChange={setIsPublic}
          refImages={refImages}
          refRejected={refRejected}
          refBusy={refBusy}
          refDisabledReason={
            storageOff ? "storage" : model?.supportsImageToImage ? null : "unsupported"
          }
          onAddRefImages={addRefImages}
          onRemoveRefImage={removeRefImage}
          onRetryRefImage={retryRefImage}
        />
        <ResultPanel pending={pending} current={current} error={error} recent={recent} />
      </div>
      <InsufficientCreditsDialog
        open={showUpgrade}
        balance={balance}
        onClose={() => setShowUpgrade(false)}
      />
    </>
  );
}
