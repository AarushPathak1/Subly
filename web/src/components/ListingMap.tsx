interface ListingMapProps {
  address: string;
  lat?: number | null;
  lng?: number | null;
  heightPx?: number;
}

export function ListingMap({ address, lat, lng, heightPx = 300 }: ListingMapProps) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center" style={{ height: heightPx }}>
        <p className="text-sm text-slate-400">Map unavailable</p>
      </div>
    );
  }
  // Prefer precise coordinates; fall back to address string for legacy listings
  const q = lat != null && lng != null
    ? `${lat},${lng}`
    : encodeURIComponent(address);
  const src = `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}&zoom=15`;
  return (
    <iframe
      title={`Map of ${address}`}
      width="100%"
      height={heightPx}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      src={src}
      className="rounded-xl border border-slate-200"
    />
  );
}
