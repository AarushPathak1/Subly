"use client";
import Script from "next/script";

export function GoogleMapsScript() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  return (
    <Script
      id="google-maps-js"
      strategy="afterInteractive"
      src={`https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&v=weekly&loading=async`}
    />
  );
}
