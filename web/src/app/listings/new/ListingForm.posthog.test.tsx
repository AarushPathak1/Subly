import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCreateListing = vi.fn();
const mockUpdateListing = vi.fn();
const mockGetPresignedUrl = vi.fn();
const mockCapture = vi.fn();
const mockPush = vi.fn();

vi.mock("@/lib/actions", () => ({
  createListing: (...args: unknown[]) => mockCreateListing(...args),
  updateListing: Object.assign(
    (...args: unknown[]) => mockUpdateListing(...args),
    {
      bind: (_thisArg: unknown, listingId: string) =>
        (...args: unknown[]) => mockUpdateListing(listingId, ...args),
    }
  ),
  getPresignedUrl: (...args: unknown[]) => mockGetPresignedUrl(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/posthog/client", () => ({
  capture: (...args: unknown[]) => mockCapture(...args),
}));

import ListingForm from "@/app/listings/new/ListingForm";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const validValues = {
  title: "Sunny 2BR near campus",
  description: "Great place",
  address: "123 College Ave, Austin, TX 78701",
  university_near: "University of Texas at Austin",
  rent: "1200",
  bedrooms: "2",
  bathrooms: "1",
  available_from: "2026-08-01",
  available_to: "",
};

async function fillForm() {
  await userEvent.type(screen.getByPlaceholderText(/sunny 2br/i), validValues.title);
  await userEvent.type(screen.getByPlaceholderText(/tell renters/i), validValues.description);
  await userEvent.type(screen.getByPlaceholderText(/start typing an address/i), validValues.address);
  await userEvent.type(screen.getByPlaceholderText(/ut austin, ucla/i), validValues.university_near);
  await userEvent.type(screen.getByPlaceholderText(/1,200/i), validValues.rent);

  const fromInput = document.querySelector('input[name="available_from"]') as HTMLInputElement;
  fireEventChange(fromInput, validValues.available_from);
}

function fireEventChange(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  mockCreateListing.mockResolvedValue({ toast: "Listing queued for AI verification" });
  mockUpdateListing.mockResolvedValue({ toast: "Listing updated successfully" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ListingForm posthog listing_created gating", () => {
  it("fires listing_created on successful create with no PII fields", async () => {
    render(<ListingForm />);
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: /post sublease/i }));

    await waitFor(() => expect(mockCreateListing).toHaveBeenCalled());
    await waitFor(() => expect(mockCapture).toHaveBeenCalledTimes(1));

    const [eventName, properties] = mockCapture.mock.calls[0];
    expect(eventName).toBe("listing_created");
    expect(properties).toMatchObject({
      rent_cents: 120000,
      bedrooms: 1,
      bathrooms: 1,
      university_near: validValues.university_near,
      image_count: 0,
      has_end_date: false,
    });
    // Must never include free-text PII fields.
    expect(properties).not.toHaveProperty("title");
    expect(properties).not.toHaveProperty("description");
    expect(properties).not.toHaveProperty("address");
  });

  it("does not fire listing_created when mode is edit", async () => {
    render(<ListingForm mode="edit" listingId="listing-1" initialValues={validValues} />);
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(mockUpdateListing).toHaveBeenCalled());
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("does not fire listing_created when the server action returns an error", async () => {
    mockCreateListing.mockResolvedValueOnce({ error: "Failed to create listing. Please try again." });
    render(<ListingForm />);
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: /post sublease/i }));

    await waitFor(() => expect(mockCreateListing).toHaveBeenCalled());
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("does not fire listing_created when client-side validation fails", async () => {
    render(<ListingForm />);
    // Submit with no fields filled in — validation should block before the action runs.
    await userEvent.click(screen.getByRole("button", { name: /post sublease/i }));

    expect(mockCreateListing).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
