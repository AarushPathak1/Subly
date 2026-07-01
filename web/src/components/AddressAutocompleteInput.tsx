"use client";
import { useRef, useState, useEffect } from "react";

export interface AddressAutocompleteInputProps {
  name: string;
  defaultValue?: string;
  defaultLat?: string;
  defaultLng?: string;
  className?: string;
  placeholder?: string;
  error?: string;
  countryRestriction?: string;
}

export function AddressAutocompleteInput({
  name, defaultValue, defaultLat, defaultLng,
  className, placeholder, error, countryRestriction = "us",
}: AddressAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lat, setLat] = useState(defaultLat ?? "");
  const [lng, setLng] = useState(defaultLng ?? "");

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 100; // 5s at 50ms
    const iv = setInterval(() => {
      attempts++;
      const G = (window as any).google;
      if (G?.maps?.places?.Autocomplete) {
        clearInterval(iv);
        const ac = new G.maps.places.Autocomplete(inputRef.current!, {
          types: ["address"],
          fields: ["formatted_address", "geometry"],
          componentRestrictions: { country: countryRestriction },
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) {
            console.warn("Google Places: no geometry on selected place");
            return;
          }
          if (inputRef.current) inputRef.current.value = place.formatted_address ?? "";
          setLat(String(place.geometry.location.lat()));
          setLng(String(place.geometry.location.lng()));
        });
      } else if (attempts >= maxAttempts) {
        clearInterval(iv);
        console.warn("Google Maps failed to load — falling back to plain text address");
      }
    }, 50);
    return () => clearInterval(iv);
  }, [countryRestriction]);

  return (
    <div>
      <input
        ref={inputRef}
        name={name}
        defaultValue={defaultValue}
        className={className}
        placeholder={placeholder}
        onChange={() => { setLat(""); setLng(""); }}
        autoComplete="off"
      />
      <input type="hidden" name="lat" value={lat} readOnly />
      <input type="hidden" name="lng" value={lng} readOnly />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
