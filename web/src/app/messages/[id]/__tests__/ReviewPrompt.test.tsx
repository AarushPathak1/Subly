import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewPrompt } from "../ReviewPrompt";

vi.mock("../confirmed/ReviewForm", () => ({
  ReviewForm: ({ onSuccess }: { conversationId: string; onSuccess?: () => void }) => (
    <div>
      <p>How was your match?</p>
      <button onClick={onSuccess}>Submit mock</button>
    </div>
  ),
}));

describe("ReviewPrompt", () => {
  it("renders collapsed banner with lister name by default", () => {
    render(<ReviewPrompt conversationId="conv-1" listerName="lister@wisc.edu" />);
    expect(screen.getByText(/lister@wisc\.edu/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /leave a review/i })).toBeInTheDocument();
    expect(screen.queryByText(/how was your match/i)).toBeNull();
  });

  it("expands to show ReviewForm when Leave a review is clicked", () => {
    render(<ReviewPrompt conversationId="conv-1" listerName="lister@wisc.edu" />);
    fireEvent.click(screen.getByRole("button", { name: /leave a review/i }));
    expect(screen.getByText(/how was your match/i)).toBeInTheDocument();
  });

  it("collapses back to banner when × is clicked", () => {
    render(<ReviewPrompt conversationId="conv-1" listerName="lister@wisc.edu" />);
    fireEvent.click(screen.getByRole("button", { name: /leave a review/i }));
    fireEvent.click(screen.getByRole("button", { name: /close review form/i }));
    expect(screen.queryByText(/how was your match/i)).toBeNull();
    expect(screen.getByRole("button", { name: /leave a review/i })).toBeInTheDocument();
  });

  it("hides entire prompt after successful submission", () => {
    render(<ReviewPrompt conversationId="conv-1" listerName="lister@wisc.edu" />);
    fireEvent.click(screen.getByRole("button", { name: /leave a review/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit mock/i }));
    expect(screen.queryByRole("button", { name: /leave a review/i })).toBeNull();
    expect(screen.queryByText(/how was your match/i)).toBeNull();
  });
});
