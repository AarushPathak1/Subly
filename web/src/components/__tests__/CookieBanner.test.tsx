import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockInitPostHogClient = vi.fn();

vi.mock("@/lib/posthog/client", () => ({
  initPostHogClient: (...args: unknown[]) => mockInitPostHogClient(...args),
}));

import { CookieBanner } from "@/components/CookieBanner";

const CONSENT_KEY = "subly_cookie_consent";

beforeEach(() => {
  localStorage.clear();
  mockInitPostHogClient.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CookieBanner", () => {
  it("renders when no consent is stored, with the accurate analytics-disclosure copy", () => {
    render(<CookieBanner />);

    expect(
      screen.getByText(
        /We use essential cookies to keep you signed in, plus one optional analytics cookie \(PostHog\) to improve the product\. Decline to opt out of analytics — essential cookies always stay on\./
      )
    ).toBeInTheDocument();

    // Must not regress to the old, inaccurate "no tracking" claim.
    expect(screen.queryByText(/no tracking/i)).not.toBeInTheDocument();
  });

  it("links to the Cookie Policy page", () => {
    render(<CookieBanner />);

    const link = screen.getByRole("link", { name: "Cookie Policy" });
    expect(link).toHaveAttribute("href", "/cookies");
  });

  it("does not render when consent was already given", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    render(<CookieBanner />);

    expect(screen.queryByText(/essential cookies/i)).not.toBeInTheDocument();
  });

  it("does not render when consent was already declined", () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    render(<CookieBanner />);

    expect(screen.queryByText(/essential cookies/i)).not.toBeInTheDocument();
  });

  it("accepting stores consent and initializes PostHog", async () => {
    const user = userEvent.setup();
    render(<CookieBanner />);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(localStorage.getItem(CONSENT_KEY)).toBe("accepted");
    expect(mockInitPostHogClient).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/essential cookies/i)).not.toBeInTheDocument();
  });

  it("declining stores consent and does not initialize PostHog", async () => {
    const user = userEvent.setup();
    render(<CookieBanner />);

    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(localStorage.getItem(CONSENT_KEY)).toBe("declined");
    expect(mockInitPostHogClient).not.toHaveBeenCalled();
    expect(screen.queryByText(/essential cookies/i)).not.toBeInTheDocument();
  });
});
