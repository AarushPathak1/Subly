"use client";

import { useState } from "react";
import { PhotoLightbox } from "@/components/PhotoLightbox";

export interface PhotoGalleryProps {
  images: string[];
}

export function PhotoGallery({ images }: PhotoGalleryProps): JSX.Element | null {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (images.length === 0) return null;

  function open(i: number) {
    setLightboxIndex(i);
    setLightboxOpen(true);
  }

  const tiles = images.slice(0, 4);
  const extra = images.length - 4;

  return (
    <>
      <div className={`grid gap-1 ${images.length === 1 ? "" : "grid-cols-2"}`}>
        {tiles.map((url, i) => {
          const isLastTile = i === 3 && images.length > 4;
          return (
            <button
              key={i}
              type="button"
              onClick={() => open(i)}
              aria-label={
                isLastTile
                  ? `View all ${images.length} photos`
                  : `Open photo ${i + 1} of ${images.length}`
              }
              className={`relative bg-slate-100 overflow-hidden group focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${
                images.length === 1
                  ? "h-80"
                  : i === 0 && images.length >= 3
                  ? "row-span-2 h-full min-h-[320px]"
                  : "h-40"
              }`}
            >
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover transition group-hover:scale-[1.02]"
              />
              {isLastTile && (
                <span className="absolute inset-0 bg-black/55 flex items-center justify-center text-white font-bold text-lg pointer-events-none">
                  +{extra} more
                </span>
              )}
            </button>
          );
        })}
      </div>

      <PhotoLightbox
        images={images}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
