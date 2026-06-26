import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRefresh = vi.fn();
const mockDeleteListing = vi.fn();

vi.mock("@/lib/actions", () => ({
  updateListingStatus: vi.fn(),
  deleteListing: (...args: unknown[]) => mockDeleteListing(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { MyListingsClient } from "@/app/listings/my/MyListingsClient";

afterEach(() => {
  vi.clearAllMocks();
});

function baseListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "listing-1",
    title: "Cozy studio near campus",
    address: "123 Main St",
    university_near: "UT Austin",
    rent_cents: 120000,
    available_from: "2026-07-01",
    bedrooms: 1,
    bathrooms: 1,
    images: [],
    scam_score: 0,
    status: "active",
    view_count: 0,
    ...overrides,
  };
}

describe("MyListingsClient view count rendering", () => {
  it("renders '0 views' (plural) when view_count is exactly 0", () => {
    render(<MyListingsClient listings={[baseListing({ view_count: 0 })]} />);
    expect(screen.getByText("0 views")).toBeInTheDocument();
    expect(screen.queryByText("0 view")).not.toBeInTheDocument();
  });

  it("renders '1 view' (singular) when view_count is exactly 1", () => {
    render(<MyListingsClient listings={[baseListing({ view_count: 1 })]} />);
    expect(screen.getByText("1 view")).toBeInTheDocument();
    expect(screen.queryByText("1 views")).not.toBeInTheDocument();
  });

  it("renders '2 views' (plural) when view_count is 2", () => {
    render(<MyListingsClient listings={[baseListing({ view_count: 2 })]} />);
    expect(screen.getByText("2 views")).toBeInTheDocument();
  });

  it("renders large counts pluralized correctly", () => {
    render(<MyListingsClient listings={[baseListing({ view_count: 1234 })]} />);
    expect(screen.getByText("1234 views")).toBeInTheDocument();
  });

  it("renders the empty state with no view count text when there are no listings", () => {
    render(<MyListingsClient listings={[]} />);
    expect(screen.getByText("No listings yet")).toBeInTheDocument();
    expect(screen.queryByText(/views?$/)).not.toBeInTheDocument();
  });

  it("groups listings into status sections and each card shows its own view count", () => {
    render(
      <MyListingsClient
        listings={[
          baseListing({ id: "a", status: "active", view_count: 5 }),
          baseListing({ id: "b", status: "paused", view_count: 0 }),
          baseListing({ id: "c", status: "leased", view_count: 1 }),
        ]}
      />
    );
    expect(screen.getByText("5 views")).toBeInTheDocument();
    expect(screen.getByText("0 views")).toBeInTheDocument();
    expect(screen.getByText("1 view")).toBeInTheDocument();
  });
});

describe("MyListingsClient delete button (M1)", () => {
  it("renders a Delete button for an active listing", () => {
    render(<MyListingsClient listings={[baseListing()]} />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not call deleteListing if the confirm dialog is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<MyListingsClient listings={[baseListing()]} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(window.confirm).toHaveBeenCalledWith("Are you sure? This cannot be undone.");
    expect(mockDeleteListing).not.toHaveBeenCalled();
  });

  it("calls deleteListing and removes the card on confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteListing.mockResolvedValue({});
    const user = userEvent.setup();
    render(<MyListingsClient listings={[baseListing({ title: "Delete me" })]} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteListing).toHaveBeenCalledWith("listing-1"));
    await waitFor(() => expect(screen.queryByText("Delete me")).not.toBeInTheDocument());
  });

  it("keeps the card visible if deleteListing returns an error", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteListing.mockResolvedValue({ error: "Failed to delete listing." });
    const user = userEvent.setup();
    render(<MyListingsClient listings={[baseListing({ title: "Keep me" })]} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteListing).toHaveBeenCalled());
    expect(screen.getByText("Keep me")).toBeInTheDocument();
  });

  it("renders a Delete button for an expired listing (no other actions available)", () => {
    render(<MyListingsClient listings={[baseListing({ status: "expired" })]} />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
