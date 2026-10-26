import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Images } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GalleryCard } from "@/components/gallery-card";
import { listGallery } from "@/lib/backend";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("galleryTitle") };
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const [t, params] = await Promise.all([getTranslations("Gallery"), searchParams]);
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const result = await listGallery({ cursor, limit: 24 });
  const images = result.ok ? result.data.images : [];

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-12 sm:px-8 lg:pt-20">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{t("backHome")}</Link>
      <div className="mb-10 mt-8 max-w-2xl">
        <p className="mb-3 text-xs font-bold uppercase tracking-[.22em] text-[#699071] dark:text-[#a6c8a7]">{t("eyebrow")}</p>
        <h1 className="text-4xl font-semibold tracking-[-.05em] sm:text-6xl">{t("title")}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{t("description")}</p>
      </div>
      {images.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {images.map((image) => <GalleryCard key={image.id} image={image} viewImageLabel={t("viewImage")} />)}
        </div>
      ) : (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-card px-6 text-center">
          <Images className="mb-4 size-9 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="text-lg font-semibold">{result.ok ? t("empty") : t("unavailable")}</h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">{result.ok ? t("emptyDescription") : t("unavailableDescription")}</p>
        </div>
      )}
      {result.ok && result.data.nextCursor && (
        <div className="mt-10 flex justify-center"><Link href={`/gallery?cursor=${encodeURIComponent(result.data.nextCursor)}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-6 text-sm font-semibold transition hover:bg-muted">{t("nextPage")}<ArrowRight className="size-4" aria-hidden="true" /></Link></div>
      )}
      {cursor && <div className="mt-7 text-center"><Link href="/gallery" className="text-sm text-muted-foreground underline-offset-4 hover:underline">{t("firstPage")}</Link></div>}
    </div>
  );
}
