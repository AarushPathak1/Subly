interface ListingMapProps {
  lat: number;
  lng: number;
  address: string;
  heightPx?: number;
}

export function ListingMap({ lat, lng, address, heightPx = 300 }: ListingMapProps) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center" style={{ height: heightPx }}>
        <p className="text-sm text-slate-400">Map unavailable</p>
      </div>
    );
  }
  const src = `https://www.google.com/maps/embed/v1/place?key=${key}&q=${lat},${lng}&zoom=15`;
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
