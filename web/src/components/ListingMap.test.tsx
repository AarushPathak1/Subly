import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingMap } from "@/components/ListingMap";

const ORIGINAL_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "TEST_KEY";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  } else {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = ORIGINAL_KEY;
  }
});

describe("ListingMap", () => {
  it("renders an iframe with the correct src", () => {
    render(<ListingMap lat={30.28} lng={-97.73} address="123 Main St" />);

    const iframe = screen.getByTitle(/123 Main St/i);
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute(
      "src",
      "https://www.google.com/maps/embed/v1/place?key=TEST_KEY&q=30.28,-97.73&zoom=15"
    );
  });

  it("sets a descriptive title for accessibility", () => {
    render(<ListingMap lat={30.28} lng={-97.73} address="123 Main St" />);

    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.title).toContain("123 Main St");
  });

  it("falls back to address-based embed when lat/lng are absent", () => {
    render(<ListingMap address="423 W Mifflin St, Madison, WI" />);

    const iframe = screen.getByTitle(/423 W Mifflin St/i);
    expect(iframe).toHaveAttribute(
      "src",
      `https://www.google.com/maps/embed/v1/place?key=TEST_KEY&q=${encodeURIComponent("423 W Mifflin St, Madison, WI")}&zoom=15`
    );
  });

  it("renders fallback when API key is unset", () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    render(<ListingMap lat={30.28} lng={-97.73} address="X" />);

    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText("Map unavailable")).toBeInTheDocument();
  });
});
