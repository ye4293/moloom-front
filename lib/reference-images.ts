/**
 * 参考图在**浏览器里**的预处理：缩放 + 压到字节上限。
 *
 * 为什么必须在客户端做，而不是传原图让后端压：
 *
 * | 环节 | 上限 |
 * |---|---|
 * | 浏览器 → BFF（Vercel 函数） | **4.5MB**（超出 413 `FUNCTION_PAYLOAD_TOO_LARGE`） |
 * | BFF → 后端（宿主 nginx） | **2MB**（`deploy/nginx.conf.example` 的 `client_max_body_size`） |
 * | 手机照片实际大小 | 3–8MB |
 *
 * 也就是说原图连不到后端就会被平台拦掉，而那两个 413 都不带任何有用信息。
 *
 * **收敛目标是字节数而不是像素数。** 只限 ≤2MP 的话，一张噪点多的照片压完仍可能
 * 超 1.5MB，加 base64 膨胀（×4/3）就顶到 nginx 的 2MB。定字节上限之后，
 * 900KB × 1.34 ≈ 1.2MB，对 2MB 有 1.6 倍余量，于是**不需要去改 nginx** ——
 * 少一处只能手工同步的运维配置。
 *
 * 三层上限的关系是刻意的：**这里 < 后端的 maxReferenceDataURLChars < nginx**。
 * 任何一层收紧到低于前一层，症状都会变成"前端以为自己压够了，却拿到一个说不清
 * 原因的失败"。
 */

/** 长边上限。FLUX.2 输出最高 4MP，参考图比输出还大没有意义。 */
export const MAX_EDGE = 1536;

/** 编码后的字节上限（见文件头注释的三层关系）。 */
export const MAX_BYTES = 900_000;

/** 起始 JPEG 质量，以及降到多少就不再降。 */
const QUALITY_START = 0.85;
const QUALITY_FLOOR = 0.6;
const QUALITY_STEP = 0.08;

/** 一次生成最多带几张参考图。与后端和上游一致（BFL 只开到 input_image_8）。 */
export const MAX_REFERENCE_IMAGES = 8;

/**
 * 浏览器与上游都接受的类型。
 *
 * **HEIC 不在里面**，而 iPhone 默认就是 HEIC —— 这是最容易被漏掉的一种输入。
 * 好消息是 `<input accept="image/*">` 在 iOS 上会自动把 HEIC 转成 JPEG 再交给页面，
 * 所以正常路径不会走到这里；但用户从文件管理器拖一个 .heic 进来时会，
 * 那时必须给一条说得清的提示而不是让 canvas 静默画出一张空白图。
 */
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type RejectReason = "unsupportedType" | "tooMany" | "decodeFailed";

export type SelectionResult = {
  accepted: File[];
  rejected: { file: File; reason: RejectReason }[];
};

/**
 * 计算缩放后的宽高。
 *
 * **只缩不放。** 少了 `Math.min(1, …)` 的钳制，一张 200×200 的小图会被放大到
 * 1536×1536 —— 画质一点没多，而上游按输入百万像素计量，等于白花钱。
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * 挑出可用的文件，并把不可用的**连原因一起**返回。
 *
 * **不静默丢弃。** 用户选了 10 张只上传了 8 张、或者混进一个 .heic 被悄悄跳过，
 * 界面上却没有任何说明——那会让人以为上传坏了，反复重试。
 *
 * @param already 已经选中的张数，用于算还能再收几张。
 */
export function validateSelection(files: File[], already = 0): SelectionResult {
  const accepted: File[] = [];
  const rejected: { file: File; reason: RejectReason }[] = [];
  let room = MAX_REFERENCE_IMAGES - already;

  for (const file of files) {
    if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
      rejected.push({ file, reason: "unsupportedType" });
      continue;
    }
    if (room <= 0) {
      rejected.push({ file, reason: "tooMany" });
      continue;
    }
    accepted.push(file);
    room -= 1;
  }
  return { accepted, rejected };
}

/**
 * 把一个图片文件压成 data URL（`data:image/jpeg;base64,...`）。
 *
 * **统一转 JPEG，所以透明通道会丢**（PNG 的透明区域会变成黑色）。这是刻意的取舍：
 * JPEG 的压缩率是把手机照片塞进上限的唯一办法，而参考图的用途是"给模型看构图与
 * 风格"，透明度几乎不影响那件事。**但界面上必须说出来**（词条 `referenceHint`），
 * 否则一个传 logo 的用户会得到一个黑底的结果，而看不出为什么。
 *
 * 循环降质量直到达标；降到 QUALITY_FLOOR 仍超限就返回最后那一版 ——
 * 与其报错让用户无路可走，不如让后端那道上限来拒（那时报错信息里有确切字节数）。
 */
export async function compressToDataURL(
  file: File,
  opts: { maxEdge?: number; maxBytes?: number } = {},
): Promise<string> {
  const maxEdge = opts.maxEdge ?? MAX_EDGE;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;

  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = targetDimensions(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    // 先铺白底再画。**不铺的话 PNG 的透明区域在转 JPEG 时会变成黑色** ——
    // 一个透明背景的 logo 会得到一张黑底图，而用户完全看不出为什么。
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    let dataURL = canvas.toDataURL("image/jpeg", QUALITY_START);
    let quality = QUALITY_START;
    while (dataURLBytes(dataURL) > maxBytes && quality > QUALITY_FLOOR) {
      quality = Math.max(QUALITY_FLOOR, quality - QUALITY_STEP);
      dataURL = canvas.toDataURL("image/jpeg", quality);
    }
    return dataURL;
  } finally {
    // ImageBitmap 持有解码后的位图，一张 4000×3000 就是几十 MB。
    // 不关的话选 8 张会在 GC 之前把移动端浏览器压垮。
    bitmap.close();
  }
}

/**
 * data URL 的载荷解码后有多少字节。
 *
 * 不去真的解码：base64 每 4 个字符对应 3 字节，尾部的 `=` 是填充。
 * 解码一遍只为了数长度，会在移动端为每次质量迭代多分配一份完整的图。
 */
export function dataURLBytes(dataURL: string): number {
  const comma = dataURL.indexOf(",");
  if (comma < 0) return 0;
  const payload = dataURL.slice(comma + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}
