import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSubmitReview = vi.fn();
const mockCapture = vi.fn();

vi.mock("@/lib/actions", () => ({
  submitReview: (...args: unknown[]) => mockSubmitReview(...args),
}));

vi.mock("@/lib/posthog/client", () => ({
  capture: (...args: unknown[]) => mockCapture(...args),
}));

import { ReviewForm } from "@/app/messages/[id]/confirmed/ReviewForm";

const CONVERSATION_ID = "c1";

beforeEach(() => {
  mockSubmitReview.mockResolvedValue({ toast: "Thanks for your review!" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ReviewForm", () => {
  it("renders five clickable stars, none selected by default", () => {
    render(<ReviewForm conversationId={CONVERSATION_ID} />);
    const stars = screen.getAllByRole("button", { name: /rate \d star/i });
    expect(stars).toHaveLength(5);
  });

  it("selects rating on star click", async () => {
    render(<ReviewForm conversationId={CONVERSATION_ID} />);
    await userEvent.click(screen.getByRole("button", { name: "Rate 4 stars" }));
    const submitButton = screen.getByRole("button", { name: /submit review/i });
    expect(submitButton).not.toBeDisabled();
  });

  it("disables submit until rating selected", () => {
    render(<ReviewForm conversationId={CONVERSATION_ID} />);
    expect(screen.getByRole("button", { name: /submit review/i })).toBeDisabled();
  });

  it("calls submitReview with rating and body on submit", async () => {
    render(<ReviewForm conversationId={CONVERSATION_ID} />);
    await userEvent.click(screen.getByRole("button", { name: "Rate 5 stars" }));
    await userEvent.type(screen.getByPlaceholderText(/optional/i), "Great match!");
    await userEvent.click(screen.getByRole("button", { name: /submit review/i }));

    await waitFor(() => expect(mockSubmitReview).toHaveBeenCalled());
    const [conversationId, prev, formData] = mockSubmitReview.mock.calls[0];
    expect(conversationId).toBe(CONVERSATION_ID);
    expect(prev).toBeNull();
    expect((formData as FormData).get("rating")).toBe("5");
    expect((formData as FormData).get("body")).toBe("Great match!");
  });

  it("shows success state after action resolves", async () => {
    render(<ReviewForm conversationId={CONVERSATION_ID} />);
    await userEvent.click(screen.getByRole("button", { name: "Rate 5 stars" }));
    await userEvent.click(screen.getByRole("button", { name: /submit review/i }));

    await waitFor(() => expect(screen.getByText(/thanks for your review/i)).toBeInTheDocument());
  });

  it("shows error inline when action returns error", async () => {
    mockSubmitReview.mockResolvedValueOnce({ error: "You've already reviewed this match." });
    render(<ReviewForm conversationId={CONVERSATION_ID} />);
    await userEvent.click(screen.getByRole("button", { name: "Rate 3 stars" }));
    await userEvent.click(screen.getByRole("button", { name: /submit review/i }));

    await waitFor(() => expect(screen.getByText(/already reviewed this match/i)).toBeInTheDocument());
  });

  it("fires posthog capture on success with conversation_id and rating", async () => {
    render(<ReviewForm conversationId={CONVERSATION_ID} />);
    await userEvent.click(screen.getByRole("button", { name: "Rate 5 stars" }));
    await userEvent.click(screen.getByRole("button", { name: /submit review/i }));

    await waitFor(() =>
      expect(mockCapture).toHaveBeenCalledWith("review_submitted", {
        conversation_id: CONVERSATION_ID,
        rating: 5,
      })
    );
  });
});
