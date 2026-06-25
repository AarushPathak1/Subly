import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignOut = vi.fn();
const mockPush = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: mockSignOut }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { DeleteAccountSection } from "@/components/DeleteAccountSection";

beforeEach(() => {
  mockSignOut.mockResolvedValue(undefined);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DeleteAccountSection", () => {
  it("renders with the delete button disabled by default", () => {
    render(<DeleteAccountSection />);
    expect(screen.getByRole("button", { name: /delete my account/i })).toBeDisabled();
  });

  it("keeps the button disabled when the confirmation text doesn't match", async () => {
    render(<DeleteAccountSection />);
    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "delete");
    expect(screen.getByRole("button", { name: /delete my account/i })).toBeDisabled();
  });

  it("enables the button once the exact confirmation word is typed", async () => {
    render(<DeleteAccountSection />);
    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "DELETE");
    expect(screen.getByRole("button", { name: /delete my account/i })).not.toBeDisabled();
  });

  it("calls DELETE /api/account, signs out, and redirects home on success", async () => {
    render(<DeleteAccountSection />);
    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "DELETE");
    await userEvent.click(screen.getByRole("button", { name: /delete my account/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/account", { method: "DELETE" }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("shows an error and does not sign out when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    render(<DeleteAccountSection />);
    const input = screen.getByPlaceholderText("DELETE");
    await userEvent.type(input, "DELETE");
    await userEvent.click(screen.getByRole("button", { name: /delete my account/i }));

    await waitFor(() => expect(screen.getByText(/failed to delete account/i)).toBeInTheDocument());
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
