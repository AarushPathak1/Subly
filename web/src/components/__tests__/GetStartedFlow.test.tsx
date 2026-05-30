import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockOpenSignUp = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openSignUp: mockOpenSignUp }),
}));

// InviteModal uses requestInvite server action — stub it out
vi.mock("@/lib/actions", () => ({
  requestInvite: vi.fn(),
}));

// useFormState / useFormStatus are Next.js / React 19 APIs not available in jsdom
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: (action: unknown, initial: unknown) => [initial, action],
    useFormStatus: () => ({ pending: false }),
  };
});

// createPortal renders inline in jsdom by default with @testing-library
import { GetStartedFlow } from "../GetStartedFlow";

beforeEach(() => {
  mockOpenSignUp.mockClear();
});

describe("GetStartedFlow", () => {
  it("renders a 'Get started for free' button by default", () => {
    render(<GetStartedFlow />);
    expect(screen.getByRole("button", { name: /get started for free/i })).toBeInTheDocument();
  });

  it("renders a compact variant button", () => {
    render(<GetStartedFlow compact />);
    expect(screen.getByRole("button", { name: /get started free/i })).toBeInTheDocument();
  });

  it("opens the email modal on button click", async () => {
    render(<GetStartedFlow />);
    await userEvent.click(screen.getByRole("button", { name: /get started for free/i }));
    expect(screen.getByText(/create your account/i)).toBeInTheDocument();
  });

  it("closes the modal on Escape", async () => {
    render(<GetStartedFlow />);
    await userEvent.click(screen.getByRole("button", { name: /get started for free/i }));
    expect(screen.getByText(/create your account/i)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText(/create your account/i)).not.toBeInTheDocument();
    });
  });

  it("shows error for non-email input", async () => {
    render(<GetStartedFlow />);
    await userEvent.click(screen.getByRole("button", { name: /get started for free/i }));
    const emailInput = screen.getByPlaceholderText(/university\.edu/i);
    await userEvent.type(emailInput, "notanemail");
    // Use fireEvent.submit to bypass HTML native email validation in jsdom
    fireEvent.submit(emailInput.closest("form")!);
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
  });

  it("calls clerk openSignUp for a .edu email", async () => {
    render(<GetStartedFlow />);
    await userEvent.click(screen.getByRole("button", { name: /get started for free/i }));
    const emailInput = screen.getByPlaceholderText(/university\.edu/i);
    await userEvent.type(emailInput, "student@utexas.edu");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(mockOpenSignUp).toHaveBeenCalledWith({
      initialValues: { emailAddress: "student@utexas.edu" },
    });
  });

  it("opens the InviteModal for a non-.edu email", async () => {
    render(<GetStartedFlow />);
    await userEvent.click(screen.getByRole("button", { name: /get started for free/i }));
    const emailInput = screen.getByPlaceholderText(/university\.edu/i);
    await userEvent.type(emailInput, "student@gmail.com");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/request early access/i)).toBeInTheDocument();
    expect(mockOpenSignUp).not.toHaveBeenCalled();
  });

  it("'Request access' link in modal also opens InviteModal", async () => {
    render(<GetStartedFlow />);
    await userEvent.click(screen.getByRole("button", { name: /get started for free/i }));
    const link = screen.getByRole("button", { name: /request access/i });
    await userEvent.click(link);
    expect(await screen.findByText(/request early access/i)).toBeInTheDocument();
  });
});
