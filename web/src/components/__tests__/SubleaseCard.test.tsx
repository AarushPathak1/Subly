import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubleaseCard, type CardListing } from "@/components/SubleaseCard";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a>,
}));
vi.mock("@/lib/actions", () => ({
  saveListing: vi.fn().mockResolvedValue({}),
  unsaveListing: vi.fn().mockResolvedValue({}),
  fetchSavedListingIds: vi.fn().mockResolvedValue(new Set()),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const baseListing: CardListing = {
  id: "abc-123",
  title: "Cozy 2BR near campus",
  university: "University of Wisconsin - Madison",
  rent_cents: 90000,
  available_from: "2026-08-01",
  available_to: null,
  bedrooms: 2,
  bathrooms: 1,
  image_url: "https://example.com/photo.jpg",
  scam_score: 0.1,
  score: 0.85,
};

describe("SubleaseCard", () => {
  it("renders image when image_url is provided", () => {
    render(<SubleaseCard listing={baseListing} isSaved={false} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    expect(img).toHaveAttribute("alt", "Cozy 2BR near campus");
  });

  it("renders gradient placeholder when image_url is null", () => {
    render(<SubleaseCard listing={{ ...baseListing, image_url: null }} isSaved={false} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getAllByText("University of Wisconsin - Madison").length >= 1).toBe(true);
  });

  it("renders university name in card body", () => {
    render(<SubleaseCard listing={baseListing} isSaved={false} />);
    expect(screen.getByText("University of Wisconsin - Madison")).toBeInTheDocument();
  });

  it("renders score badge when score is present", () => {
    render(<SubleaseCard listing={baseListing} isSaved={false} />);
    expect(screen.getByText(/85% match/i)).toBeInTheDocument();
  });

  it("does not render score badge when score is null", () => {
    render(<SubleaseCard listing={{ ...baseListing, score: null }} isSaved={false} />);
    expect(screen.queryByText(/% match/i)).toBeNull();
  });

  it("does not render score badge when score is undefined", () => {
    const { score: _omitted, ...noScore } = baseListing;
    render(<SubleaseCard listing={noScore} isSaved={false} />);
    expect(screen.queryByText(/% match/i)).toBeNull();
  });

  it("renders trust indicator with Trusted label for low scam score", () => {
    render(<SubleaseCard listing={baseListing} isSaved={false} />);
    expect(screen.getByText("Trusted")).toBeInTheDocument();
  });

  it("renders High Risk label when scam_score > 0.7", () => {
    render(<SubleaseCard listing={{ ...baseListing, scam_score: 0.9 }} isSaved={false} />);
    expect(screen.getByText("High Risk")).toBeInTheDocument();
  });

  it("renders rent formatted with /mo suffix", () => {
    render(<SubleaseCard listing={baseListing} isSaved={false} />);
    expect(screen.getByText(/\$900\/mo/)).toBeInTheDocument();
  });

  it("renders beds/baths in Xbd · Yba format", () => {
    render(<SubleaseCard listing={baseListing} isSaved={false} />);
    expect(screen.getByText(/2bd · 1ba/)).toBeInTheDocument();
  });

  it("wraps the card in a link to /listings/:id", () => {
    render(<SubleaseCard listing={baseListing} isSaved={false} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/listings/abc-123");
  });
});
