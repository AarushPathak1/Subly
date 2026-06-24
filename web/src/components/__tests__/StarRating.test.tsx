import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { StarRating } from "@/components/StarRating";

function fillCount(container: HTMLElement) {
  return Array.from(container.querySelectorAll("svg")).filter(
    (svg) => svg.getAttribute("fill") === "#f59e0b"
  ).length;
}

describe("StarRating", () => {
  it("renders 5 stars", () => {
    const { container } = render(<StarRating value={3} />);
    expect(container.querySelectorAll("svg")).toHaveLength(5);
  });

  it("fills stars based on rounded value", () => {
    const { container } = render(<StarRating value={3.6} />);
    expect(fillCount(container)).toBe(4);
  });

  it("fills 0 stars for value 0", () => {
    const { container } = render(<StarRating value={0} />);
    expect(fillCount(container)).toBe(0);
  });

  it("fills all 5 stars for value 5", () => {
    const { container } = render(<StarRating value={5} />);
    expect(fillCount(container)).toBe(5);
  });

  it("rounds down at the midpoint boundary correctly", () => {
    const { container } = render(<StarRating value={2.4} />);
    expect(fillCount(container)).toBe(2);
  });

  it("rounds exact half-values up (Math.round ties round toward +Infinity)", () => {
    // Math.round(3.5) === 4 per the JS spec (ties round away from zero for
    // positive numbers). This means an average rating of exactly 3.5 visually
    // renders identically to a 3.6-3.99 average (4 filled stars) — verifying
    // this is the intended behavior, not an accidental floor/ceil mismatch.
    const { container } = render(<StarRating value={3.5} />);
    expect(fillCount(container)).toBe(4);
  });

  it("applies a custom size", () => {
    const { container } = render(<StarRating value={3} size={24} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
  });

  it("defaults to size 16", () => {
    const { container } = render(<StarRating value={3} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("height", "16");
  });
});
