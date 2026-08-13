import { NextResponse } from "next/server";
import { ERR_BAD_REQUEST, ERR_FORBIDDEN, uploadReferenceImage } from "@/lib/backend";
import { checkSameOrigin, toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";
import { MAX_BYTES } from "@/lib/reference-images";

/**
 * 参考图上传转交后端 `POST /api/v1/uploads/reference`。
 *
 * **收 `application/json` + data URL，不收 multipart。** 这不是随手选的：
 * `multipart/form-data` 与 `text/plain` 一样属于 CORS **简单请求**类型、
 * **不触发预检**，所以一个收 multipart 的上传端点等于开一个跨域页面能直接打的、
 * 有副作用的入口。走 JSON 之后后端那条路由能挂上 `JSONOnly`（415 挡住非 JSON），
 * 跨域请求必须先过预检，而预检会被 CORS 白名单拦下。
 *
 * 后端返回的是**不透明对象键**而不是 URL。前端拿键去发起生成，URL 由后端自己从
 * 配置拼——这样"用户可控的 URL"根本不存在，也就没有"校验这个 URL 属于我们的 R2"
 * 那条容易出绕过的路径（见后端 internal/handler/uploads.go 的注释）。
 * 缩略图预览用本地的 `URL.createObjectURL(file)`，不需要这个 URL。
 */

/**
 * data URL 字符串的字符数上限。
 *
 * 在这里也拦一道，是为了让超限**在进入网络之前**被拒掉：Vercel 函数的请求体上限
 * 是 4.5MB，超了返回一个不带任何信息的 413 `FUNCTION_PAYLOAD_TOO_LARGE`，
 * 而那条错误在浏览器里看不出跟图片大小有关。
 *
 * 取压缩目标的 2 倍（`MAX_BYTES` 是解码后字节，base64 膨胀约 4/3 ≈ 1.2MB）：
 * 松到不会误伤正常请求，紧到远低于平台上限。后端还有一道更精确的
 * （`maxReferenceDataURLChars`），三层从松到紧排列。
 */
const MAX_DATA_URL_CHARS = Math.ceil((MAX_BYTES * 4) / 3) * 2;

export async function POST(req: Request) {
  const forbidden = checkSameOrigin(req);
  if (forbidden) {
    return NextResponse.json(forbidden.body, { status: forbidden.status });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }

  // `req.json()` 返回 any，显式收窄（同 app/api/generations/route.ts 的写法）：
  // 一个拼错的 `body?.imgae` 也能过编译，然后静默变成"缺少 image"。
  const body: unknown = await req.json().catch(() => null);
  const fields = (typeof body === "object" && body !== null ? body : {}) as { image?: unknown };

  if (typeof fields.image !== "string" || !fields.image.startsWith("data:image/")) {
    return NextResponse.json(
      { code: ERR_BAD_REQUEST, message: "image must be an image data URL" },
      { status: 400 },
    );
  }
  if (fields.image.length > MAX_DATA_URL_CHARS) {
    return NextResponse.json(
      { code: ERR_BAD_REQUEST, message: "image is too large" },
      { status: 413 },
    );
  }

  const res = await uploadReferenceImage(token, fields.image);
  if (!res.ok) {
    // 50302（后端未配置对象存储）与 413 都原样透传：前端要按码分别显示
    // "本部署未开启参考图"与"图太大"，换成通用文案会让人无从下手。
    const out = toClientError(res.error, res.status, "uploads");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data, { status: 200 });
}
