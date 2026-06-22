import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProposeViewingModal } from "@/app/messages/[id]/ProposeViewingModal";

function setDateTimeValue(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("ProposeViewingModal", () => {
  it("submit is disabled when the datetime input is empty", () => {
    render(<ProposeViewingModal onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("submit is disabled while submitting", () => {
    render(<ProposeViewingModal onSubmit={vi.fn()} onCancel={vi.fn()} submitting={true} />);
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
  });

  it("converts the local datetime value to a UTC ISO string on submit", async () => {
    const onSubmit = vi.fn();
    render(<ProposeViewingModal onSubmit={onSubmit} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/date & time/i);
    setDateTimeValue(input, "2026-07-05T18:30");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [isoArg] = onSubmit.mock.calls[0];
    expect(isoArg).toBe(new Date("2026-07-05T18:30").toISOString());
  });

  it("passes the trimmed note through to onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<ProposeViewingModal onSubmit={onSubmit} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/date & time/i);
    setDateTimeValue(input, "2026-07-05T18:30");
    await userEvent.type(screen.getByLabelText(/note/i), "  Happy to give a tour then.  ");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.any(String), "Happy to give a tour then.");
  });

  it("passes undefined note when left empty", async () => {
    const onSubmit = vi.fn();
    render(<ProposeViewingModal onSubmit={onSubmit} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/date & time/i);
    setDateTimeValue(input, "2026-07-05T18:30");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it("enforces a maxLength of 280 on the note textarea", () => {
    render(<ProposeViewingModal onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const textarea = screen.getByLabelText(/note/i);
    expect(textarea).toHaveAttribute("maxLength", "280");
  });

  it("shows a character counter for the note", async () => {
    render(<ProposeViewingModal onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/note/i), "hello");
    expect(screen.getByText("5/280")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<ProposeViewingModal onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("sets the min attribute on the datetime input to roughly now", () => {
    render(<ProposeViewingModal onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/date & time/i);
    expect(input).toHaveAttribute("min");
    const min = input.getAttribute("min")!;
    expect(min.length).toBeGreaterThan(0);
  });
});
