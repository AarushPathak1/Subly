import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewsSection } from "@/components/ReviewsSection";
import type { PublicReview, ReviewSummary } from "@/lib/actions";

function makeReview(overrides: Partial<PublicReview> = {}): PublicReview {
  return {
    id: "r1",
    rating: 5,
    body: "Great experience!",
    created_at: "2026-01-15T00:00:00Z",
    reviewer_display_name: "Alex T.",
    reviewer_university: "UCLA",
    listing_title: "Cozy studio near campus",
    ...overrides,
  };
}

describe("ReviewsSection", () => {
  it("renders only empty state when summary.count is 0", () => {
    const summary: ReviewSummary = { average: null, count: 0 };
    render(<ReviewsSection title="Reviews" reviews={[]} summary={summary} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/review/, { selector: "span" })).not.toBeInTheDocument();
  });

  it("renders empty state even when summary.count > 0 but reviews array is empty", () => {
    const summary: ReviewSummary = { average: 4, count: 3 };
    render(<ReviewsSection title="Reviews" reviews={[]} summary={summary} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
    expect(screen.getByText("3 reviews")).toBeInTheDocument();
  });

  it("renders review grid when reviews are present", () => {
    const summary: ReviewSummary = { average: 5, count: 1 };
    render(<ReviewsSection title="Reviews" reviews={[makeReview()]} summary={summary} />);
    expect(screen.getByText("Great experience!")).toBeInTheDocument();
    expect(screen.queryByText(/no reviews yet/i)).not.toBeInTheDocument();
  });

  it("renders average and count text in the header", () => {
    const summary: ReviewSummary = { average: 4.6, count: 12 };
    render(<ReviewsSection title="Reviews" reviews={[makeReview()]} summary={summary} />);
    expect(screen.getByText("4.6")).toBeInTheDocument();
    expect(screen.getByText("12 reviews")).toBeInTheDocument();
  });

  it("renders em dash when average is null but count is nonzero", () => {
    const summary: ReviewSummary = { average: null, count: 2 };
    render(
      <ReviewsSection
        title="Reviews"
        reviews={[makeReview({ id: "r1" }), makeReview({ id: "r2" })]}
        summary={summary}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("uses singular 'review' for count of 1", () => {
    const summary: ReviewSummary = { average: 5, count: 1 };
    render(<ReviewsSection title="Reviews" reviews={[makeReview()]} summary={summary} />);
    expect(screen.getByText("1 review")).toBeInTheDocument();
  });

  it("uses plural 'reviews' for count > 1", () => {
    const summary: ReviewSummary = { average: 5, count: 2 };
    render(
      <ReviewsSection
        title="Reviews"
        reviews={[makeReview({ id: "r1" }), makeReview({ id: "r2" })]}
        summary={summary}
      />
    );
    expect(screen.getByText("2 reviews")).toBeInTheDocument();
  });

  it("caps displayed review cards at 6 when given more", () => {
    const reviews = Array.from({ length: 10 }, (_, i) => makeReview({ id: `r${i}` }));
    const summary: ReviewSummary = { average: 5, count: 10 };
    render(<ReviewsSection title="Reviews" reviews={reviews} summary={summary} />);
    expect(screen.getAllByText("Alex T.")).toHaveLength(6);
  });

  it("omits the body paragraph when a review has an empty body", () => {
    const review = makeReview({ body: "" });
    const summary: ReviewSummary = { average: 5, count: 1 };
    render(<ReviewsSection title="Reviews" reviews={[review]} summary={summary} />);
    expect(screen.queryByText("Great experience!")).not.toBeInTheDocument();
  });

  it("renders body text when present", () => {
    const summary: ReviewSummary = { average: 5, count: 1 };
    render(<ReviewsSection title="Reviews" reviews={[makeReview()]} summary={summary} />);
    expect(screen.getByText("Great experience!")).toBeInTheDocument();
  });

  it("renders the title", () => {
    const summary: ReviewSummary = { average: null, count: 0 };
    render(<ReviewsSection title="Reviews of this lister" reviews={[]} summary={summary} />);
    expect(screen.getByText("Reviews of this lister")).toBeInTheDocument();
  });

  it("renders review grid without the header star/count cluster when summary.count is 0 but reviews array is non-empty", () => {
    const summary: ReviewSummary = { average: null, count: 0 };
    render(<ReviewsSection title="Reviews" reviews={[makeReview()]} summary={summary} />);
    expect(screen.getByText("Great experience!")).toBeInTheDocument();
    expect(screen.queryByText(/no reviews yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/review$/, { selector: "span" })).not.toBeInTheDocument();
  });

});
