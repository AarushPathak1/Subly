import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSaveListing = vi.fn();
const mockUnsaveListing = vi.fn();
const mockRefresh = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/lib/actions", () => ({
  saveListing: (...args: unknown[]) => mockSaveListing(...args),
  unsaveListing: (...args: unknown[]) => mockUnsaveListing(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

import { SaveButton } from "@/components/SaveButton";

const LISTING_ID = "listing-1";

beforeEach(() => {
  mockSaveListing.mockResolvedValue({});
  mockUnsaveListing.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SaveButton", () => {
  it("renders unsaved state with correct aria-pressed", () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="detail" />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Save");
  });

  it("renders saved state with correct aria-pressed", () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={true} variant="detail" />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("Saved");
  });

  it("clicking toggles optimistically from unsaved to saved", async () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="detail" />);
    const button = screen.getByRole("button");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking toggles optimistically from saved to unsaved", async () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={true} variant="detail" />);
    const button = screen.getByRole("button");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("calls saveListing with the right id when toggling on", async () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="detail" />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockSaveListing).toHaveBeenCalledWith(LISTING_ID));
    expect(mockUnsaveListing).not.toHaveBeenCalled();
  });

  it("calls unsaveListing with the right id when toggling off", async () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={true} variant="detail" />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockUnsaveListing).toHaveBeenCalledWith(LISTING_ID));
    expect(mockSaveListing).not.toHaveBeenCalled();
  });

  it("rolls back state and shows a toast on a failed save", async () => {
    mockSaveListing.mockResolvedValueOnce({ error: "Failed to save listing" });
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="detail" />);
    const button = screen.getByRole("button");
    await userEvent.click(button);

    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(mockToastError).toHaveBeenCalledWith("Failed to save listing");
  });

  it("rolls back state and shows a toast on a failed unsave", async () => {
    mockUnsaveListing.mockResolvedValueOnce({ error: "Failed to unsave listing" });
    render(<SaveButton listingId={LISTING_ID} initialSaved={true} variant="detail" />);
    const button = screen.getByRole("button");
    await userEvent.click(button);

    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
    expect(mockToastError).toHaveBeenCalledWith("Failed to unsave listing");
  });

  it("calls router.refresh() on a successful save", async () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="detail" />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("does not call router.refresh() on a failed action", async () => {
    mockSaveListing.mockResolvedValueOnce({ error: "Failed to save listing" });
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="detail" />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("click handler calls preventDefault and stopPropagation so it doesn't trigger a parent Link's navigation", () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="detail" />);
    const button = screen.getByRole("button");
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "preventDefault", { value: preventDefault });
    Object.defineProperty(event, "stopPropagation", { value: stopPropagation });
    button.dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it("the handleClick guard short-circuits on isPending (in-flight save resolves to exactly one call)", async () => {
    let resolveSave: (value: { error?: string }) => void = () => {};
    mockSaveListing.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSave = resolve; })
    );
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="detail" />);
    const button = screen.getByRole("button");

    await act(async () => {
      fireEvent.click(button);
      resolveSave({});
      await Promise.resolve();
    });
    await waitFor(() => expect(mockSaveListing).toHaveBeenCalledTimes(1));
    expect(mockUnsaveListing).not.toHaveBeenCalled();
  });

  it("button is not disabled when idle", () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="detail" />);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("renders the card variant as an absolutely positioned overlay button", () => {
    render(<SaveButton listingId={LISTING_ID} initialSaved={false} variant="card" />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("absolute");
  });
});
