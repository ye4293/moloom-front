import Image from "next/image";
import { ArrowRight, ArrowUpRight, Images, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listGallery, listModels } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { GalleryCard } from "@/components/gallery-card";

const families = [
  { key: "flux", name: "FLUX", pattern: /flux/i, number: "01" },
  { key: "grok", name: "Grok Image", pattern: /grok/i, number: "02" },
  { key: "gpt", name: "GPT Image", pattern: /gpt[ -]?image/i, number: "03" },
] as const;

export default async function HomePage() {
  const [t, token, gallery, models] = await Promise.all([
    getTranslations("Home"), getToken(), listGallery({ limit: 8 }), listModels(),
  ]);
  const signedIn = Boolean(token);
  const createHref = signedIn ? "/generate" : "/register";
  const images = gallery.ok ? gallery.data.images : [];
  const heroImage = images[0];

  return (
    <>
      <section className="relative overflow-hidden border-b border-[#d9d5cd] bg-[#f5f2ec] text-[#20251f] dark:border-border dark:bg-[#171c19] dark:text-[#f1f1e9]">
        <div className="pointer-events-none absolute -right-40 -top-56 size-[40rem] rounded-full bg-[#dce8d5]/60 blur-3xl dark:bg-[#315044]/20" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-16 lg:pb-24 lg:pt-24">
          <div className="max-w-2xl">
            <div className="mb-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-[.22em] text-[#56705b] dark:text-[#a4c5a7]">
              <span className="inline-flex size-7 items-center justify-center rounded-full border border-current"><Sparkles className="size-3.5" aria-hidden="true" /></span>{t("eyebrow")}
            </div>
            <h1 className="text-balance text-[clamp(3.2rem,6vw,6.4rem)] font-semibold leading-[1.04] tracking-[-.065em]">
              {t("heroLine1")}<br /><span className="text-[#ef7846]">{t("heroLine2")}</span>
            </h1>
            <p className="mt-8 max-w-lg text-base leading-8 text-[#5c6259] dark:text-[#bdc6ba] sm:text-lg">{t("heroDescription")}</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={createHref} className="inline-flex h-12 items-center gap-3 rounded-full bg-[#243f30] px-6 text-sm font-semibold text-white transition hover:bg-[#355b42] focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-[#c8e2c6] dark:text-[#142018] dark:hover:bg-white">
                {signedIn ? t("continueCreating") : t("getStartedFree")} <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/gallery" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#cbcfc5] px-6 text-sm font-semibold transition hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-[#57665c] dark:hover:bg-white/10">
                {t("exploreGallery")} <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-7 text-xs font-medium tracking-wide text-[#7d8277] dark:text-[#a2ad9f]">{t("heroFootnote")}</p>
          </div>

          <div className="relative mx-auto w-full max-w-[540px] lg:ml-auto" aria-label={t("heroVisualLabel")}>
            <div className="absolute -left-6 top-9 hidden size-36 rounded-full border border-[#a8b7a5]/50 sm:block" />
            <div className="absolute -right-5 bottom-7 hidden size-48 rounded-full border border-[#e4a28c]/60 sm:block" />
            <div className="relative aspect-[1.12/1] overflow-hidden rounded-[2rem] border-[7px] border-white bg-[#a8b7a5] shadow-[0_35px_80px_-36px_rgba(28,45,29,.45)] dark:border-[#3a443b]">
              {heroImage ? (
                <Image src={heroImage.imageUrl} alt={heroImage.prompt} fill unoptimized sizes="(max-width: 1024px) 100vw, 540px" className="object-cover" priority />
              ) : (
                <div className="relative flex size-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_70%_25%,#eadcc6_0,#b4c6ae_42%,#587662_100%)] dark:bg-[radial-gradient(circle_at_70%_25%,#6c826f_0,#344e42_47%,#1e3028_100%)]">
                  <div className="absolute -left-16 bottom-[-40%] size-[80%] rounded-full bg-[#e5ddc5]/75 blur-xl" />
                  <div className="absolute right-[-15%] top-[-13%] size-[63%] rounded-full bg-[#315d49]/60 blur-md" />
                  <div className="relative flex size-[48%] rotate-[-18deg] items-center justify-center rounded-[30%] border border-white/60 bg-white/15 shadow-2xl backdrop-blur-sm"><span className="font-serif text-[clamp(7rem,15vw,12rem)] italic leading-none text-white/85">M</span></div>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md"><span className="size-1.5 rounded-full bg-[#b5f3b9]" />{heroImage ? t("communityCreation") : t("yourCanvas")}</div>
            </div>
            <div className="absolute -bottom-5 -right-2 rounded-2xl border border-[#d7dbce] bg-[#fffdf8] px-5 py-3 text-xs font-semibold shadow-xl dark:border-[#536559] dark:bg-[#243329] sm:-right-5">
              <span className="block text-[#8d9889]">{t("visualTag")}</span><span className="mt-1 block text-sm">{heroImage?.model ?? t("visualFallback")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-28" id="gallery-preview">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
          <div><p className="mb-3 text-xs font-bold uppercase tracking-[.22em] text-[#699071] dark:text-[#a6c8a7]">{t("galleryEyebrow")}</p><h2 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{t("galleryTitle")}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{t("galleryDescription")}</p></div>
          <Link href="/gallery" className="inline-flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline">{t("viewAllGallery")} <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
        </div>
        {images.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{images.map((image) => <GalleryCard key={image.id} image={image} viewImageLabel={t("viewImage")} />)}</div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-card/60 px-6 text-center">
            <Images className="mb-4 size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-base font-semibold">{gallery.ok ? t("galleryEmpty") : t("galleryUnavailable")}</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{gallery.ok ? t("galleryEmptyDescription") : t("galleryUnavailableDescription")}</p>
            <Link href={createHref} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">{signedIn ? t("continueCreating") : t("getStartedFree")} <ArrowRight className="size-4" aria-hidden="true" /></Link>
          </div>
        )}
      </section>

      <section className="border-y bg-[#eeeee8] px-5 py-20 dark:bg-[#161d19] sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-2xl"><p className="mb-3 text-xs font-bold uppercase tracking-[.22em] text-[#699071] dark:text-[#a6c8a7]">{t("modelsEyebrow")}</p><h2 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{t("modelsTitle")}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{t("modelsDescription")}</p></div>
          <div className="grid gap-4 md:grid-cols-3">
            {families.map((family) => {
              const available = models.ok ? models.data.models.filter((model) => family.pattern.test(`${model.id} ${model.name}`)) : [];
              return <div key={family.key} className="flex min-h-64 flex-col rounded-[1.5rem] border border-border/80 bg-card p-6 shadow-[0_18px_36px_-36px_rgba(0,0,0,.5)]">
                <div className="flex items-start justify-between"><span className="text-xs font-semibold tracking-[.2em] text-muted-foreground">{family.number} / 03</span><span className={`rounded-full px-3 py-1 text-xs font-medium ${available.length ? "bg-[#e3f2e4] text-[#245b32] dark:bg-[#274331] dark:text-[#b8e9bd]" : "bg-muted text-muted-foreground"}`}>{!models.ok ? t("availabilityUnknown") : available.length ? t("available") : t("comingSoon")}</span></div>
                <div className="mt-auto"><h3 className="text-3xl font-semibold tracking-[-.045em]">{family.name}</h3><p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">{t(`modelDescription.${family.key}`)}</p>{available.length > 0 && <p className="mt-4 text-xs font-semibold text-[#4a7952] dark:text-[#a6c8a7]">{t("availableModels", { count: available.length })}</p>}</div>
              </div>;
            })}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">{t("modelAvailabilityNote")}</p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-24"><div className="flex flex-col gap-6 rounded-[2rem] bg-[#243f30] px-7 py-10 text-white sm:px-12 sm:py-14 lg:flex-row lg:items-end lg:justify-between dark:bg-[#294432]">
        <div className="max-w-2xl"><p className="mb-4 text-xs font-semibold uppercase tracking-[.22em] text-[#b4d8b7]">{t("finalEyebrow")}</p><h2 className="text-balance text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{signedIn ? t("finalTitleSignedIn") : t("finalTitleGuest")}</h2><p className="mt-4 text-sm leading-7 text-[#c7dccb]">{signedIn ? t("finalDescriptionSignedIn") : t("finalDescriptionGuest")}</p></div>
        <Link href={createHref} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#243f30] transition hover:bg-[#e7f3e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{signedIn ? t("continueCreating") : t("getStartedFree")} <ArrowRight className="size-4" aria-hidden="true" /></Link>
      </div></section>
    </>
  );
}
