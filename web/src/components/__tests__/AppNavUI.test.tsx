import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <button>Account</button>,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/SublyLogo", () => ({
  SublyLogo: () => <svg data-testid="subly-logo" />,
}));

import { AppNavUI } from "@/components/AppNavUI";

describe("AppNavUI", () => {
  // ── Badge logic ─────────────────────────────────────────────────────────────

  describe("unread badge", () => {
    it("does not show a badge when unreadCount is 0", () => {
      render(<AppNavUI unreadCount={0} />);
      expect(screen.queryByText(/^\d+$|^9\+$/)).not.toBeInTheDocument();
    });

    it("does not show a badge when unreadCount is undefined", () => {
      render(<AppNavUI />);
      expect(screen.queryByText(/^\d+$|^9\+$/)).not.toBeInTheDocument();
    });

    it("shows the count when unreadCount is between 1 and 9", () => {
      render(<AppNavUI unreadCount={3} />);
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("shows '9+' when unreadCount is exactly 10", () => {
      render(<AppNavUI unreadCount={10} />);
      expect(screen.getByText("9+")).toBeInTheDocument();
    });

    it("shows '9+' when unreadCount is greater than 9", () => {
      render(<AppNavUI unreadCount={99} />);
      expect(screen.getByText("9+")).toBeInTheDocument();
    });

    it("shows '9' (not '9+') when unreadCount is exactly 9", () => {
      render(<AppNavUI unreadCount={9} />);
      expect(screen.getByText("9")).toBeInTheDocument();
      expect(screen.queryByText("9+")).not.toBeInTheDocument();
    });

    it("badge is positioned near the Messages link", () => {
      render(<AppNavUI unreadCount={5} />);
      const badge = screen.getByText("5");
      const link = badge.closest("a");
      expect(link?.getAttribute("href")).toBe("/messages");
    });
  });

  // ── Nav links ────────────────────────────────────────────────────────────────

  describe("navigation links", () => {
    it("renders all main nav links", () => {
      render(<AppNavUI />);
      // Use exact string to avoid matching the back-arrow's title="Back to My matches"
      expect(screen.getByRole("link", { name: "My matches" })).toHaveAttribute("href", "/dashboard");
      expect(screen.getByRole("link", { name: "Browse" })).toHaveAttribute("href", "/listings");
      expect(screen.getByRole("link", { name: "Saved" })).toHaveAttribute("href", "/listings/saved");
      expect(screen.getByRole("link", { name: "My listings" })).toHaveAttribute("href", "/listings/my");
      expect(screen.getByRole("link", { name: "Post sublease" })).toHaveAttribute("href", "/listings/new");
      expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/messages");
      expect(screen.getByRole("link", { name: "Preferences" })).toHaveAttribute("href", "/onboarding");
      expect(screen.getByRole("link", { name: "My profile" })).toHaveAttribute("href", "/profile");
    });

    it("renders the Subly logo", () => {
      render(<AppNavUI />);
      expect(screen.getByTestId("subly-logo")).toBeInTheDocument();
    });
  });

  // ── Back arrow ───────────────────────────────────────────────────────────────

  describe("back arrow", () => {
    it("shows back arrow when active is not 'dashboard'", () => {
      render(<AppNavUI active="browse" />);
      expect(screen.getByTitle("Back to My matches")).toBeInTheDocument();
    });

    it("hides back arrow when active is 'dashboard'", () => {
      render(<AppNavUI active="dashboard" />);
      expect(screen.queryByTitle("Back to My matches")).not.toBeInTheDocument();
    });

    it("shows back arrow when no active prop is provided (not on dashboard)", () => {
      render(<AppNavUI />);
      // undefined !== "dashboard" → back arrow is shown
      expect(screen.getByTitle("Back to My matches")).toBeInTheDocument();
    });
  });

  // ── Active link highlight ────────────────────────────────────────────────────

  describe("active link highlighting", () => {
    it("active link has indigo color class", () => {
      render(<AppNavUI active="browse" />);
      const browseLink = screen.getByRole("link", { name: "Browse" });
      expect(browseLink.className).toContain("indigo");
    });

    it("inactive links have slate color class", () => {
      render(<AppNavUI active="browse" />);
      const dashLink = screen.getByRole("link", { name: "My matches" });
      expect(dashLink.className).toContain("slate");
    });

    it("saved link is highlighted when active is 'saved'", () => {
      render(<AppNavUI active="saved" />);
      const savedLink = screen.getByRole("link", { name: "Saved" });
      expect(savedLink.className).toContain("indigo");
    });

    it("messages link is highlighted when active is 'messages'", () => {
      render(<AppNavUI active="messages" unreadCount={2} />);
      // When unreadCount > 0 the badge text is inside the link, changing its accessible name.
      // Find by href attribute instead.
      const messagesLink = document.querySelector('a[href="/messages"]');
      expect(messagesLink?.className).toContain("indigo");
    });
  });
});
