"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface PhotoLightboxProps {
  images: string[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

function clampIndex(i: number, len: number): number {
  return ((i % len) + len) % len;
}

export function PhotoLightbox({ images, initialIndex, open, onClose }: PhotoLightboxProps): JSX.Element | null {
  const [index, setIndex] = useState(initialIndex);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Sync index when opened at a new initialIndex
  useEffect(() => {
    if (open && images.length > 0) {
      setIndex(clampIndex(initialIndex, images.length));
    }
  }, [open, initialIndex, images.length]);

  // Keyboard handler + body scroll lock
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (images.length <= 1) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setIndex(i => clampIndex(i - 1, images.length)); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); setIndex(i => clampIndex(i + 1, images.length)); return; }
      if (e.key === "Tab") {
        const focusables = [closeRef.current, prevRef.current, nextRef.current].filter(Boolean) as HTMLElement[];
        if (focusables.length === 0) return;
        const active = document.activeElement as HTMLElement | null;
        const idx = active ? focusables.indexOf(active) : -1;
        const dir = e.shiftKey ? -1 : 1;
        const nextEl = focusables[clampIndex(idx + dir, focusables.length)];
        e.preventDefault();
        nextEl.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    overlayRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, images.length, onClose]);

  if (!open || images.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      tabIndex={-1}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-sm focus:outline-none"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/90 text-sm font-semibold select-none pointer-events-none">
        {index + 1} / {images.length}
      </div>

      {/* Close */}
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Prev */}
      {images.length > 1 && (
        <button
          ref={prevRef}
          type="button"
          onClick={() => setIndex(i => clampIndex(i - 1, images.length))}
          aria-label="Previous photo"
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* Image */}
      <img
        src={images[index]}
        alt={`Photo ${index + 1} of ${images.length}`}
        className="max-w-[92vw] max-h-[88vh] object-contain select-none"
        onMouseDown={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {images.length > 1 && (
        <button
          ref={nextRef}
          type="button"
          onClick={() => setIndex(i => clampIndex(i + 1, images.length))}
          aria-label="Next photo"
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>,
    document.body
  );
}
