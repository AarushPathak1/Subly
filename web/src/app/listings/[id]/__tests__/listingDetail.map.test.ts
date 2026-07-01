import { describe, it, expect } from "vitest";
import { shouldRenderMap } from "@/lib/listingMap";

describe("shouldRenderMap", () => {
  it("returns true when address is present", () => {
    expect(shouldRenderMap({ address: "423 W Mifflin St" })).toBe(true);
  });

  it("returns true when only address is set and lat/lng are absent", () => {
    expect(shouldRenderMap({ address: "118 N Frances St" })).toBe(true);
  });

  it("returns false when address is empty string", () => {
    expect(shouldRenderMap({ address: "" })).toBe(false);
  });

  it("returns false when address is undefined", () => {
    expect(shouldRenderMap({})).toBe(false);
  });
});
