import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSubmitReport = vi.fn();

vi.mock("@/lib/actions", () => ({
  submitReport: (...args: unknown[]) => mockSubmitReport(...args),
}));

import { ReportButton } from "@/components/ReportButton";

const TARGET_ID = "listing-1";

beforeEach(() => {
  mockSubmitReport.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ReportButton", () => {
  it("opens the report form on click", async () => {
    render(<ReportButton targetKind="listing" targetId={TARGET_ID} label="Report listing" />);
    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit report/i })).toBeInTheDocument();
  });

  it("disables submit when no reason selected", async () => {
    render(<ReportButton targetKind="listing" targetId={TARGET_ID} label="Report listing" />);
    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    expect(screen.getByRole("button", { name: /submit report/i })).toBeDisabled();
  });

  it("calls submitReport with correct payload", async () => {
    render(<ReportButton targetKind="listing" targetId={TARGET_ID} label="Report listing" />);
    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    await userEvent.selectOptions(screen.getByRole("combobox"), "scam");
    await userEvent.type(screen.getByPlaceholderText(/anything else/i), "Looks fake");
    await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(mockSubmitReport).toHaveBeenCalledWith({
      target_kind: "listing",
      target_id: TARGET_ID,
      reason: "scam",
      details: "Looks fake",
    }));
  });

  it("shows confirmation message after successful report", async () => {
    render(<ReportButton targetKind="listing" targetId={TARGET_ID} label="Report listing" />);
    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    await userEvent.selectOptions(screen.getByRole("combobox"), "spam");
    await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(screen.getByText(/thanks, we've received your report/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /reported/i })).toBeDisabled();
  });

  it("shows already-reported message on 409 error", async () => {
    mockSubmitReport.mockResolvedValueOnce({ ok: false, error: "You've already reported this." });
    render(<ReportButton targetKind="listing" targetId={TARGET_ID} label="Report listing" />);
    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    await userEvent.selectOptions(screen.getByRole("combobox"), "spam");
    await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(screen.getByText(/you've already reported this/i)).toBeInTheDocument());
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows inline error and keeps the form open on a generic failure", async () => {
    mockSubmitReport.mockResolvedValueOnce({ ok: false, error: "Couldn't submit report. Please try again." });
    render(<ReportButton targetKind="listing" targetId={TARGET_ID} label="Report listing" />);
    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    await userEvent.selectOptions(screen.getByRole("combobox"), "other");
    await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn't submit report\. please try again\./i)).toBeInTheDocument()
    );
    // Unlike the 409 case, a generic failure should let the user retry —
    // the form (reason selector) stays mounted instead of being replaced.
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit report/i })).toBeInTheDocument();
  });

  it("resets reason and details when cancel is clicked", async () => {
    render(<ReportButton targetKind="listing" targetId={TARGET_ID} label="Report listing" />);
    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    await userEvent.selectOptions(screen.getByRole("combobox"), "scam");
    await userEvent.type(screen.getByPlaceholderText(/anything else/i), "some details");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByRole("button", { name: "Report listing" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByPlaceholderText(/anything else/i)).toHaveValue("");
  });
});
