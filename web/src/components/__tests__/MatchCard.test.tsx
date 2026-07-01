import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MatchCard } from "@/components/MatchCard";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a>,
}));

vi.mock("@/lib/actions", () => ({
  saveListing: vi.fn().mockResolvedValue({}),
  unsaveListing: vi.fn().mockResolvedValue({}),
  fetchSavedListingIds: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const baseMatch = {
  listing_id: "abc-123",
  score: 0.85,
  university: "University of Wisconsin - Madison",
  rent_cents: 90000,
  bedrooms: 2,
  bathrooms: 1,
  scam_score: 0.1,
  title: "Cozy 2BR near campus",
  address: "118 N Frances St, Madison, WI",
  image_url: "https://example.com/photo.jpg",
  available_from: "2026-08-01",
  available_to: null,
};

describe("MatchCard", () => {
  it("wraps the entire card in a link to the listing", () => {
    render(<MatchCard match={baseMatch} isSaved={false} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/listings/abc-123");
    expect(link).toHaveTextContent("Cozy 2BR near campus");
  });

  it("does not render a 'View listing' text link", () => {
    render(<MatchCard match={baseMatch} isSaved={false} />);
    expect(screen.queryByText(/view listing/i)).toBeNull();
  });

  it("does not render university label on top of the photo", () => {
    render(<MatchCard match={baseMatch} isSaved={false} />);
    // University should not appear as an overlay (address shows as subtitle instead)
    // The badge text only appears in the gradient no-image branch
    expect(screen.queryByText("University of Wisconsin - Madison")).toBeNull();
  });

  it("renders university badge on the no-image gradient placeholder", () => {
    render(<MatchCard match={{ ...baseMatch, image_url: null }} isSaved={false} />);
    expect(screen.getByText("University of Wisconsin - Madison")).toBeInTheDocument();
  });

  it("renders the score badge", () => {
    render(<MatchCard match={baseMatch} isSaved={false} />);
    expect(screen.getByText(/85% match/i)).toBeInTheDocument();
  });

  it("renders trust label", () => {
    render(<MatchCard match={baseMatch} isSaved={false} />);
    expect(screen.getByText("Trusted")).toBeInTheDocument();
  });
});
