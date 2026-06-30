import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoGallery } from "@/components/PhotoGallery";

/** Build an array of N distinct image URLs for test fixtures. */
function makeImages(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `photo${i + 1}.jpg`);
}

describe("PhotoGallery", () => {
  // ── Null guard ───────────────────────────────────────────────────────────────

  it("returns null for empty images", () => {
    const { container } = render(<PhotoGallery images={[]} />);
    expect(container.firstChild).toBeNull();
  });

  // ── Tile rendering ───────────────────────────────────────────────────────────

  it("renders one tile for a single image with the correct aria-label", () => {
    render(<PhotoGallery images={makeImages(1)} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("aria-label", "Open photo 1 of 1");
  });

  it("renders 4 tiles for 4 images and shows no '+N more' overlay", () => {
    render(<PhotoGallery images={makeImages(4)} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it("renders 4 tiles with a '+4 more' overlay when images.length === 8", () => {
    render(<PhotoGallery images={makeImages(8)} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByText("+4 more")).toBeInTheDocument();
  });

  // ── Opening the lightbox ─────────────────────────────────────────────────────

  it("clicking tile 0 opens the lightbox at index 0 (counter '1 / N')", async () => {
    const images = makeImages(3);
    render(<PhotoGallery images={images} />);
    await userEvent.click(screen.getByRole("button", { name: "Open photo 1 of 3" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("clicking the '+N more' tile opens the lightbox at index 3 (counter '4 / N')", async () => {
    const images = makeImages(8);
    render(<PhotoGallery images={images} />);
    await userEvent.click(screen.getByRole("button", { name: "View all 8 photos" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("4 / 8")).toBeInTheDocument();
  });

  // ── Closing the lightbox ─────────────────────────────────────────────────────

  it("closing the lightbox via the Close button removes the dialog", async () => {
    render(<PhotoGallery images={makeImages(3)} />);
    await userEvent.click(screen.getByRole("button", { name: "Open photo 1 of 3" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ── Button type attribute ────────────────────────────────────────────────────

  it('all tile buttons have type="button" (none would submit a form)', () => {
    render(<PhotoGallery images={makeImages(4)} />);
    // Lightbox is closed so only gallery tiles are in the document
    screen.getAllByRole("button").forEach((btn) => {
      expect(btn).toHaveAttribute("type", "button");
    });
  });

  // ── Overflow tile aria-label ─────────────────────────────────────────────────

  it('tile 3 has aria-label "View all N photos" when images.length > 4', () => {
    render(<PhotoGallery images={makeImages(6)} />);
    expect(
      screen.getByRole("button", { name: "View all 6 photos" })
    ).toBeInTheDocument();
  });
});
