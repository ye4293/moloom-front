import { describe, expect, it } from "vitest";
import {
  MAX_EDGE,
  MAX_REFERENCE_IMAGES,
  dataURLBytes,
  targetDimensions,
  validateSelection,
} from "@/lib/reference-images";

/** 造一个只有 type 有意义的假 File —— 这些纯函数只看 type。 */
function fakeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("targetDimensions", () => {
  it("把长边缩到上限并保持宽高比", () => {
    const got = targetDimensions(4000, 3000);
    expect(Math.max(got.width, got.height)).toBe(MAX_EDGE);
    // 比例误差控制在 1% 内（四舍五入带来的偏差）。
    const wanted = 4000 / 3000;
    expect(Math.abs(got.width / got.height - wanted) / wanted).toBeLessThan(0.01);
  });

  it("竖图同样按长边缩", () => {
    const got = targetDimensions(1000, 5000);
    expect(got.height).toBe(MAX_EDGE);
    expect(got.width).toBeLessThan(got.height);
  });

  it("**小图不放大**", () => {
    // 少了 Math.min(1, …) 的钳制，200×200 会被放大到 1536×1536：画质一点没多，
    // 而上游按输入百万像素计量，等于白花钱。
    expect(targetDimensions(200, 200)).toEqual({ width: 200, height: 200 });
    expect(targetDimensions(MAX_EDGE, MAX_EDGE)).toEqual({ width: MAX_EDGE, height: MAX_EDGE });
  });

  it("极端窄条不会退化成 0 宽", () => {
    // 4000×1 缩放后宽是 1536、高是 0.384 → 四舍五入会变 0，而 0 宽的 canvas
    // 画不出任何东西（toDataURL 返回一个空图，上传成功但参考图是空白）。
    const got = targetDimensions(4000, 1);
    expect(got.width).toBeGreaterThan(0);
    expect(got.height).toBeGreaterThanOrEqual(1);
  });
});

describe("validateSelection", () => {
  it("放行 png / jpeg / webp", () => {
    const files = [
      fakeFile("a.png", "image/png"),
      fakeFile("b.jpg", "image/jpeg"),
      fakeFile("c.webp", "image/webp"),
    ];
    const { accepted, rejected } = validateSelection(files);
    expect(accepted).toHaveLength(3);
    expect(rejected).toHaveLength(0);
  });

  it("拒掉 gif / heic / svg，并给出原因", () => {
    // HEIC 是 iPhone 的默认格式。`accept="image/*"` 在 iOS 上通常会先转成 JPEG，
    // 但从文件管理器拖进来时不会——那条路径必须有说得清的提示，
    // 而不是让 canvas 静默画出一张空白图。
    // SVG 更要拒：它是可执行脚本的图片格式。
    const files = [
      fakeFile("a.gif", "image/gif"),
      fakeFile("b.heic", "image/heic"),
      fakeFile("c.svg", "image/svg+xml"),
    ];
    const { accepted, rejected } = validateSelection(files);
    expect(accepted).toHaveLength(0);
    expect(rejected.map((r) => r.reason)).toEqual([
      "unsupportedType",
      "unsupportedType",
      "unsupportedType",
    ]);
  });

  it("超出上限的部分**带原因返回，不静默截断**", () => {
    // 静默截断的后果：用户选了 10 张只上传 8 张，界面上没有任何说明，
    // 于是以为上传坏了、反复重试。
    const files = Array.from({ length: 4 }, (_, i) => fakeFile(`${i}.png`, "image/png"));
    const { accepted, rejected } = validateSelection(files, 6);
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.reason === "tooMany")).toBe(true);
  });

  it("已经选满时全部拒掉", () => {
    const files = [fakeFile("x.png", "image/png")];
    const { accepted, rejected } = validateSelection(files, MAX_REFERENCE_IMAGES);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toBe("tooMany");
  });

  it("类型检查优先于数量检查", () => {
    // 一个不支持的类型即使在"已经满了"的情况下也该报类型问题——报"太多了"会让
    // 用户去删已选的图，而删完还是不行。
    const { rejected } = validateSelection([fakeFile("a.gif", "image/gif")], MAX_REFERENCE_IMAGES);
    expect(rejected[0].reason).toBe("unsupportedType");
  });
});

describe("dataURLBytes", () => {
  it("按 base64 长度算出解码后的字节数，不真的解码", () => {
    // "AAAA" → 3 字节；带一个 = 填充 → 2 字节；带两个 → 1 字节。
    expect(dataURLBytes("data:image/jpeg;base64,AAAA")).toBe(3);
    expect(dataURLBytes("data:image/jpeg;base64,AAA=")).toBe(2);
    expect(dataURLBytes("data:image/jpeg;base64,AA==")).toBe(1);
  });

  it("与真实解码结果一致", () => {
    const bytes = new Uint8Array(1000).fill(7);
    const b64 = Buffer.from(bytes).toString("base64");
    expect(dataURLBytes(`data:image/jpeg;base64,${b64}`)).toBe(1000);
  });

  it("没有逗号时返回 0 而不是抛异常", () => {
    expect(dataURLBytes("not-a-data-url")).toBe(0);
  });
});
