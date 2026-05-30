import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UniversityCombobox } from "../UniversityCombobox";

describe("UniversityCombobox", () => {
  it("renders with a placeholder", () => {
    render(<UniversityCombobox name="university" placeholder="Search your school" />);
    expect(screen.getByPlaceholderText("Search your school")).toBeInTheDocument();
  });

  it("shows no suggestions when query is shorter than 2 characters", async () => {
    render(<UniversityCombobox name="university" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "U");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("shows suggestions after 2+ characters", async () => {
    render(<UniversityCombobox name="university" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Texas");
    // Some university list item should appear
    const items = screen.queryAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
  });

  it("selects a suggestion on click and closes the list", async () => {
    render(<UniversityCombobox name="university" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Texas");
    const items = screen.queryAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    fireEvent.mouseDown(items[0]);
    expect((input as HTMLInputElement).value).toBe(items[0].textContent);
    expect(screen.queryAllByRole("listitem").length).toBe(0);
  });

  it("closes the dropdown on Escape", async () => {
    render(<UniversityCombobox name="university" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Texas");
    expect(screen.queryAllByRole("listitem").length).toBeGreaterThan(0);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryAllByRole("listitem").length).toBe(0);
  });

  it("navigates with arrow keys and selects with Enter", async () => {
    render(<UniversityCombobox name="university" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Texas");
    const items = screen.queryAllByRole("listitem");
    const firstText = items[0].textContent ?? "";
    const secondText = items[1]?.textContent ?? firstText;
    // Arrow down selects second item
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((input as HTMLInputElement).value).toBe(secondText);
  });

  it("populates hidden input with the selected value", async () => {
    const { container } = render(<UniversityCombobox name="university_field" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Texas");
    const items = screen.queryAllByRole("listitem");
    fireEvent.mouseDown(items[0]);
    const hidden = container.querySelector('input[type="hidden"]') as HTMLInputElement;
    expect(hidden.value).toBe(items[0].textContent);
  });

  it("renders with a defaultValue pre-filled", () => {
    render(<UniversityCombobox name="university" defaultValue="MIT" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("MIT");
  });
});
