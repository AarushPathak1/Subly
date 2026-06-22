import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/actions", () => ({
  saveProfile: vi.fn(),
}));

let mockFormState: unknown = null;

// useFormState / useFormStatus are Next.js / React 19 APIs not available in jsdom
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: (action: unknown) => [mockFormState, action],
    useFormStatus: () => ({ pending: false }),
  };
});

import VibeForm from "@/app/onboarding/VibeForm";

beforeEach(() => {
  mockFormState = null;
});

describe("VibeForm settings mode", () => {
  const existing = {
    vibe_text: "Quiet, clean, close to campus",
    university: "University of Texas at Austin",
    max_rent: "1500",
    min_bedrooms: "2",
  };

  it("renders prefilled values from existing profile", () => {
    render(<VibeForm mode="settings" university="University of Texas at Austin" existing={existing} />);

    expect(screen.getByText(/describe your ideal place/i).closest("div")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/quiet, clean, close to campus/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe(existing.vibe_text);

    const rentInput = screen.getByPlaceholderText("1,500") as HTMLInputElement;
    expect(rentInput.value).toBe(existing.max_rent);

    const bedroomsSelect = screen.getByDisplayValue("2+ bedrooms") as HTMLSelectElement;
    expect(bedroomsSelect.value).toBe(existing.min_bedrooms);
  });

  it("sets the hidden mode input to 'settings'", () => {
    render(<VibeForm mode="settings" university="UT Austin" existing={existing} />);
    const hiddenInput = document.querySelector('input[name="mode"]') as HTMLInputElement;
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput.value).toBe("settings");
  });

  it("submit button reads 'Save changes' in settings mode", () => {
    render(<VibeForm mode="settings" university="UT Austin" existing={existing} />);
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("shows a success banner when the action state returns a toast", () => {
    mockFormState = { toast: "Preferences updated" };
    render(<VibeForm mode="settings" university="UT Austin" existing={existing} />);
    expect(screen.getByText("Preferences updated")).toBeInTheDocument();
  });
});

describe("VibeForm onboarding mode", () => {
  it("sets the hidden mode input to 'onboarding' by default", () => {
    render(<VibeForm university="UT Austin" />);
    const hiddenInput = document.querySelector('input[name="mode"]') as HTMLInputElement;
    expect(hiddenInput.value).toBe("onboarding");
  });

  it("submit button reads 'Save & find my matches' when there is no existing profile", () => {
    render(<VibeForm mode="onboarding" university="UT Austin" />);
    expect(screen.getByRole("button", { name: /save & find my matches/i })).toBeInTheDocument();
  });
});
