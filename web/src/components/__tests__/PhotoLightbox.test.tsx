import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoLightbox } from "@/components/PhotoLightbox";

const IMAGES = ["a.jpg", "b.jpg", "c.jpg"];

afterEach(() => {
  // Safety-net: ensure body overflow is always reset between tests even if a
  // test fails mid-way before the component unmounts.
  document.body.style.overflow = "";
});

describe("PhotoLightbox", () => {
  // ── Null-rendering guards ────────────────────────────────────────────────────

  it("returns null when open is false", () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={false} onClose={vi.fn()} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returns null when images is empty", () => {
    render(
      <PhotoLightbox images={[]} initialIndex={0} open={true} onClose={vi.fn()} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ── Initial rendering ────────────────────────────────────────────────────────

  it("renders dialog showing image at initialIndex", () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={1} open={true} onClose={vi.fn()} />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // images[1] === "b.jpg"
    expect(screen.getByRole("img")).toHaveAttribute("src", "b.jpg");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  // ── Navigation buttons ───────────────────────────────────────────────────────

  it("Next button advances to next image", async () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={1} open={true} onClose={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByRole("img")).toHaveAttribute("src", "c.jpg");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("Prev button goes to previous image", async () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={1} open={true} onClose={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(screen.getByRole("img")).toHaveAttribute("src", "a.jpg");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  // ── Wrap-around ──────────────────────────────────────────────────────────────

  it("Next wraps from last image to first", async () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={2} open={true} onClose={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("Prev wraps from first image to last", async () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={true} onClose={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  // ── Keyboard navigation ──────────────────────────────────────────────────────

  it("ArrowRight keydown advances to next image", () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={true} onClose={vi.fn()} />
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("ArrowLeft keydown goes to previous image", () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={1} open={true} onClose={vi.fn()} />
    );
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("Escape keydown calls onClose", () => {
    const onClose = vi.fn();
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={true} onClose={onClose} />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Close interactions ───────────────────────────────────────────────────────

  it("Close button calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={true} onClose={onClose} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mouseDown on the overlay backdrop calls onClose", () => {
    const onClose = vi.fn();
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={true} onClose={onClose} />
    );
    // Dispatch the event directly on the overlay div so e.target === overlayRef.current
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mouseDown on the image does NOT call onClose", () => {
    const onClose = vi.fn();
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={true} onClose={onClose} />
    );
    // The img has stopPropagation; even without it, e.target !== overlayRef
    fireEvent.mouseDown(screen.getByRole("img"));
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Single-image mode ────────────────────────────────────────────────────────

  it("Single image: no Prev/Next buttons, arrow keys are no-ops, counter is '1 / 1'", () => {
    const onClose = vi.fn();
    render(
      <PhotoLightbox images={["a.jpg"]} initialIndex={0} open={true} onClose={onClose} />
    );
    expect(
      screen.queryByRole("button", { name: "Previous photo" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next photo" })
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Counter format ───────────────────────────────────────────────────────────

  it("counter text matches the '<N> / <total>' pattern", () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={true} onClose={vi.fn()} />
    );
    // Match an element whose entire text content is the counter format
    expect(screen.getByText(/^\d+ \/ \d+$/)).toBeInTheDocument();
  });

  // ── Body scroll lock ─────────────────────────────────────────────────────────

  it("sets document.body.style.overflow to 'hidden' while open", () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={true} onClose={vi.fn()} />
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  // ── Tab focus cycling ────────────────────────────────────────────────────────

  it("Tab key cycles focus: close → prev → next → close", () => {
    render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={true} onClose={vi.fn()} />
    );
    const closeBtn = screen.getByRole("button", { name: "Close photo viewer" });
    const prevBtn = screen.getByRole("button", { name: "Previous photo" });
    const nextBtn = screen.getByRole("button", { name: "Next photo" });

    // Manually focus close to establish the starting point
    act(() => { closeBtn.focus(); });
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(prevBtn);

    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(nextBtn);

    // Wrap back to close
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);
  });

  // ── initialIndex reset on re-open ────────────────────────────────────────────

  it("re-opening with a new initialIndex resets the displayed index", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <PhotoLightbox images={IMAGES} initialIndex={0} open={false} onClose={onClose} />
    );
    // Open at index 2 (the third image)
    rerender(
      <PhotoLightbox images={IMAGES} initialIndex={2} open={true} onClose={onClose} />
    );
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });
});
