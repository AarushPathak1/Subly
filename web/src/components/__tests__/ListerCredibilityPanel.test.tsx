import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/link to render a plain <a> so href assertions work in jsdom.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ListerCredibilityPanel } from "@/components/ListerCredibilityPanel";
import type { ReviewSummary } from "@/lib/actions";

// ── Shared defaults ────────────────────────────────────────────────────────────

const defaultSummary: ReviewSummary = { average: null, count: 0 };

function renderPanel(
  overrides: Partial<{
    listerId: string;
    university: string | null;
    memberSince: string | null;
    eduVerified: boolean;
    summary: ReviewSummary;
    showProfileLink: boolean;
  }> = {}
) {
  const props = {
    listerId: "user_123",
    university: "UCLA",
    memberSince: null,
    eduVerified: false,
    summary: defaultSummary,
    showProfileLink: true,
    ...overrides,
  };
  return render(<ListerCredibilityPanel {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ListerCredibilityPanel", () => {
  it('renders "Student at {university}" when university is provided', () => {
    renderPanel({ university: "UCLA" });
    expect(screen.getByText("Student at UCLA")).toBeInTheDocument();
  });

  it('falls back to "Subly Member" when university is null', () => {
    renderPanel({ university: null });
    expect(screen.getByText("Subly Member")).toBeInTheDocument();
    // Avatar initial should fall back to "S"
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("shows .edu verified badge when eduVerified is true", () => {
    renderPanel({ eduVerified: true });
    expect(screen.getByText(".edu verified")).toBeInTheDocument();
  });

  it("omits .edu verified badge when eduVerified is false", () => {
    renderPanel({ eduVerified: false });
    expect(screen.queryByText(".edu verified")).not.toBeInTheDocument();
  });

  it('renders "Member since {Month YYYY}" when memberSince is provided', () => {
    renderPanel({ memberSince: "2026-03-14T00:00:00Z" });
    expect(screen.getByText(/Member since March 2026/)).toBeInTheDocument();
  });

  it("omits member-since line when memberSince is null", () => {
    renderPanel({ memberSince: null });
    expect(screen.queryByText(/^Member since/)).not.toBeInTheDocument();
  });

  it("renders star rating, formatted average, and pluralised count", () => {
    // Plural: 12 reviews
    renderPanel({ summary: { average: 4.6, count: 12 } });
    expect(screen.getByText("4.6")).toBeInTheDocument();
    expect(screen.getByText("(12 reviews)")).toBeInTheDocument();
  });

  it('renders singular "(1 review)" when count is 1', () => {
    renderPanel({ summary: { average: 5.0, count: 1 } });
    expect(screen.getByText("(1 review)")).toBeInTheDocument();
    // Plural form must NOT appear
    expect(screen.queryByText("(1 reviews)")).not.toBeInTheDocument();
  });

  it('renders "No reviews yet" when summary.count is 0', () => {
    renderPanel({ summary: { average: null, count: 0 } });
    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
    // No parenthesised count should appear
    expect(screen.queryByText(/\(\d+ reviews?\)/)).not.toBeInTheDocument();
  });

  it("renders em dash when summary.average is null but count > 0", () => {
    renderPanel({ summary: { average: null, count: 3 } });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it('links "View profile" to /users/{listerId} by default (both desktop and mobile copies)', () => {
    renderPanel({ listerId: "user_123", showProfileLink: true });
    const links = screen.getAllByRole("link", { name: /view profile/i });
    // Component renders two copies: one desktop-only, one mobile-only
    expect(links).toHaveLength(2);
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "/users/user_123");
    });
  });

  it('hides "View profile" links when showProfileLink is false', () => {
    renderPanel({ listerId: "user_123", showProfileLink: false });
    expect(
      screen.queryByRole("link", { name: /view profile/i })
    ).not.toBeInTheDocument();
    // Extra guard: no anchor to the profile URL at all
    expect(
      screen.queryByRole("link", { hidden: true, name: /view profile/i })
    ).not.toBeInTheDocument();
  });

  it("uppercases first letter of university for avatar initial", () => {
    renderPanel({ university: "ucla" });
    expect(screen.getByText("U")).toBeInTheDocument();
  });
});
