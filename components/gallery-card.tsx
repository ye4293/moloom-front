import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { GalleryImage } from "@/lib/generation-types";

export function GalleryCard({ image, viewImageLabel }: { image: GalleryImage; viewImageLabel: string }) {
  return (
    <figure className="group min-w-0 overflow-hidden rounded-[1.25rem] border border-border/70 bg-card shadow-[0_10px_30px_-24px_rgba(0,0,0,.5)]">
      <a
        href={image.imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${viewImageLabel}: ${image.prompt}`}
        className="relative block aspect-[4/4.7] overflow-hidden bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-primary"
      >
        <Image
          src={image.imageUrl}
          alt={image.prompt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          unoptimized
          className="object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        />
        <span className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </span>
      </a>
      <figcaption className="space-y-2 px-4 py-4">
        <p className="line-clamp-2 min-h-10 text-sm font-medium leading-5 text-foreground">{image.prompt}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{image.model}</span>
          <span className="shrink-0">{image.aspectRatio}</span>
        </div>
      </figcaption>
    </figure>
  );
}
