import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks (same pattern as ListingForm.posthog.test.tsx) ─────────────────────

vi.mock("@/lib/actions", () => ({
  createListing: vi.fn().mockResolvedValue({ toast: "Listing created" }),
  updateListing: Object.assign(vi.fn().mockResolvedValue({ toast: "Listing updated" }), {
    bind: (_thisArg: unknown, listingId: string) =>
      (...args: unknown[]) => Promise.resolve({ toast: "Listing updated" }),
  }),
  getPresignedUrl: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/posthog/client", () => ({
  capture: vi.fn(),
}));

import ListingForm from "@/app/listings/new/ListingForm";
import { AMENITY_OPTIONS, UTILITY_OPTIONS, LEASE_TYPES, FURNISHED_OPTIONS } from "@/lib/schemas";

// ─────────────────────────────────────────────────────────────────────────────

describe("ListingForm — What's Included section", () => {
  beforeEach(() => {
    render(<ListingForm />);
  });

  // ── Amenity checkboxes ────────────────────────────────────────────────────

  it("renders exactly 12 amenity checkboxes", () => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"][name="amenities"]');
    expect(checkboxes).toHaveLength(12);
    expect(AMENITY_OPTIONS).toHaveLength(12);
  });

  it("renders amenity checkbox for WiFi", () => {
    expect(screen.getByRole("checkbox", { name: /^WiFi$/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for In-unit Laundry", () => {
    expect(screen.getByRole("checkbox", { name: /in-unit laundry/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for Dishwasher", () => {
    expect(screen.getByRole("checkbox", { name: /dishwasher/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for AC", () => {
    expect(screen.getByRole("checkbox", { name: /^AC$/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for Heat Included", () => {
    expect(screen.getByRole("checkbox", { name: /heat included/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for Parking", () => {
    expect(screen.getByRole("checkbox", { name: /^Parking$/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for Gym", () => {
    expect(screen.getByRole("checkbox", { name: /^Gym$/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for Pool", () => {
    expect(screen.getByRole("checkbox", { name: /^Pool$/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for Balcony", () => {
    expect(screen.getByRole("checkbox", { name: /balcony/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for Dog-friendly", () => {
    expect(screen.getByRole("checkbox", { name: /dog-friendly/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for Cat-friendly", () => {
    expect(screen.getByRole("checkbox", { name: /cat-friendly/i })).toBeInTheDocument();
  });

  it("renders amenity checkbox for Smoke-free", () => {
    expect(screen.getByRole("checkbox", { name: /smoke-free/i })).toBeInTheDocument();
  });

  it("all amenity checkboxes start unchecked", () => {
    const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="amenities"]'
    ));
    for (const cb of checkboxes) {
      expect(cb.checked).toBe(false);
    }
  });

  it("each amenity option from AMENITY_OPTIONS has a corresponding checkbox", () => {
    for (const option of AMENITY_OPTIONS) {
      const cb = document.querySelector<HTMLInputElement>(
        `input[type="checkbox"][name="amenities"][value="${option}"]`
      );
      expect(cb, `Expected checkbox for amenity "${option}"`).not.toBeNull();
    }
  });

  // ── Utility checkboxes ────────────────────────────────────────────────────

  it("renders exactly 5 utilities checkboxes", () => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"][name="utilities_included"]');
    expect(checkboxes).toHaveLength(5);
    expect(UTILITY_OPTIONS).toHaveLength(5);
  });

  it("renders utility checkbox for Water", () => {
    expect(screen.getByRole("checkbox", { name: /^Water$/i })).toBeInTheDocument();
  });

  it("renders utility checkbox for Electric", () => {
    expect(screen.getByRole("checkbox", { name: /^Electric$/i })).toBeInTheDocument();
  });

  it("renders utility checkbox for Gas", () => {
    expect(screen.getByRole("checkbox", { name: /^Gas$/i })).toBeInTheDocument();
  });

  it("renders utility checkbox for Internet", () => {
    expect(screen.getByRole("checkbox", { name: /^Internet$/i })).toBeInTheDocument();
  });

  it("renders utility checkbox for Trash", () => {
    expect(screen.getByRole("checkbox", { name: /^Trash$/i })).toBeInTheDocument();
  });

  it("all utility checkboxes start unchecked", () => {
    const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="utilities_included"]'
    ));
    for (const cb of checkboxes) {
      expect(cb.checked).toBe(false);
    }
  });

  it("each UTILITY_OPTIONS entry has a corresponding checkbox", () => {
    for (const option of UTILITY_OPTIONS) {
      const cb = document.querySelector<HTMLInputElement>(
        `input[type="checkbox"][name="utilities_included"][value="${option}"]`
      );
      expect(cb, `Expected checkbox for utility "${option}"`).not.toBeNull();
    }
  });

  // ── Lease type segmented control ──────────────────────────────────────────

  it("renders exactly 3 lease type buttons", () => {
    // Lease type buttons are <button type="button"> in the form
    const leaseButtons = screen.getAllByRole("button", {
      name: /whole place|private room|shared room/i,
    });
    expect(leaseButtons).toHaveLength(3);
  });

  it("renders 'Whole place' lease type button", () => {
    expect(screen.getByRole("button", { name: /whole place/i })).toBeInTheDocument();
  });

  it("renders 'Private room' lease type button", () => {
    expect(screen.getByRole("button", { name: /private room/i })).toBeInTheDocument();
  });

  it("renders 'Shared room' lease type button", () => {
    expect(screen.getByRole("button", { name: /shared room/i })).toBeInTheDocument();
  });

  it("hidden lease_type input starts empty", () => {
    const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="lease_type"]');
    expect(input).not.toBeNull();
    expect(input!.value).toBe("");
  });

  // ── Furnished segmented control ───────────────────────────────────────────

  it("renders exactly 3 furnished buttons", () => {
    const furnishedButtons = screen.getAllByRole("button", {
      name: /^(furnished|partially|unfurnished)$/i,
    });
    expect(furnishedButtons).toHaveLength(3);
  });

  it("renders 'Furnished' furnished button", () => {
    expect(screen.getByRole("button", { name: /^Furnished$/i })).toBeInTheDocument();
  });

  it("renders 'Partially' furnished button", () => {
    expect(screen.getByRole("button", { name: /^Partially$/i })).toBeInTheDocument();
  });

  it("renders 'Unfurnished' furnished button", () => {
    expect(screen.getByRole("button", { name: /^Unfurnished$/i })).toBeInTheDocument();
  });

  it("hidden furnished input starts empty", () => {
    const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="furnished"]');
    expect(input).not.toBeNull();
    expect(input!.value).toBe("");
  });
});

describe("ListingForm — What's Included interactive behavior", () => {
  // ── Segmented control state changes ──────────────────────────────────────

  it("clicking a lease type button updates the hidden input value", async () => {
    render(<ListingForm />);
    const btn = screen.getByRole("button", { name: /private room/i });
    await userEvent.click(btn);

    const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="lease_type"]');
    expect(input!.value).toBe("private_room");
  });

  it("clicking the same lease type button twice clears the selection (toggle)", async () => {
    render(<ListingForm />);
    const btn = screen.getByRole("button", { name: /whole place/i });
    await userEvent.click(btn);
    await userEvent.click(btn);

    const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="lease_type"]');
    expect(input!.value).toBe("");
  });

  it("clicking a furnished button updates the hidden input value", async () => {
    render(<ListingForm />);
    const btn = screen.getByRole("button", { name: /^Unfurnished$/i });
    await userEvent.click(btn);

    const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="furnished"]');
    expect(input!.value).toBe("unfurnished");
  });

  // ── Pre-population from initialValues ─────────────────────────────────────

  it("pre-checks amenities from initialValues", () => {
    render(
      <ListingForm
        initialValues={{ amenities: ["WiFi", "Parking"] }}
      />
    );
    const wifiCb = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name="amenities"][value="WiFi"]'
    );
    const parkingCb = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name="amenities"][value="Parking"]'
    );
    const gymCb = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name="amenities"][value="Gym"]'
    );
    expect(wifiCb!.defaultChecked).toBe(true);
    expect(parkingCb!.defaultChecked).toBe(true);
    expect(gymCb!.defaultChecked).toBe(false);
  });

  it("pre-checks utilities from initialValues", () => {
    render(
      <ListingForm
        initialValues={{ utilities_included: ["Water", "Internet"] }}
      />
    );
    const waterCb = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name="utilities_included"][value="Water"]'
    );
    const internetCb = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name="utilities_included"][value="Internet"]'
    );
    const gasCb = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name="utilities_included"][value="Gas"]'
    );
    expect(waterCb!.defaultChecked).toBe(true);
    expect(internetCb!.defaultChecked).toBe(true);
    expect(gasCb!.defaultChecked).toBe(false);
  });

  it("pre-selects lease_type from initialValues", () => {
    render(<ListingForm initialValues={{ lease_type: "shared_room" }} />);
    const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="lease_type"]');
    expect(input!.value).toBe("shared_room");
  });

  it("pre-selects furnished from initialValues", () => {
    render(<ListingForm initialValues={{ furnished: "furnished" }} />);
    const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="furnished"]');
    expect(input!.value).toBe("furnished");
  });
});
