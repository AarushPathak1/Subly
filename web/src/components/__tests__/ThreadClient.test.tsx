import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetchMessages = vi.fn();
const mockSendMessage = vi.fn();
const mockCreateCheckoutSession = vi.fn();
const mockCalculateMatchFee = vi.fn((cents: number) =>
  cents < 100000 ? 2900 : cents < 200000 ? 4900 : 7900
);

vi.mock("@/lib/actions", () => ({
  fetchMessages: (...args: unknown[]) => mockFetchMessages(...args),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  createCheckoutSession: (...args: unknown[]) => mockCreateCheckoutSession(...args),
}));

vi.mock("@/lib/fees", () => ({
  calculateMatchFee: (cents: number) => mockCalculateMatchFee(cents),
}));

// Capture window.location.href assignments
let capturedHref = "";
Object.defineProperty(window, "location", {
  value: {
    get href() { return capturedHref; },
    set href(v: string) { capturedHref = v; },
  },
  writable: true,
});

import { ThreadClient } from "@/app/messages/[id]/ThreadClient";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MY_ID = "user-lister-1";
const OTHER_ID = "user-renter-1";

const baseMessages = [
  { id: "m1", conversation_id: "c1", sender_id: OTHER_ID, body: "Hey, is it available?", created_at: "2026-06-01T10:00:00Z" },
  { id: "m2", conversation_id: "c1", sender_id: MY_ID,    body: "Yes, from July 1st.",    created_at: "2026-06-01T10:01:00Z" },
];

const defaultProps = {
  conversationId: "c1",
  currentUserId: MY_ID,
  isLister: true,
  confirmedAt: null,
  initialRentCents: 120000, // $1,200 → $49 fee
  initialMessages: baseMessages,
};

beforeEach(() => {
  capturedHref = "";
  mockFetchMessages.mockResolvedValue(baseMessages);
  mockSendMessage.mockResolvedValue({});
  mockCreateCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  // Only fake setInterval so userEvent's internal setTimeout still works
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ── Message rendering ─────────────────────────────────────────────────────────

describe("message rendering", () => {
  it("renders all initial messages", () => {
    render(<ThreadClient {...defaultProps} />);
    expect(screen.getByText("Hey, is it available?")).toBeInTheDocument();
    expect(screen.getByText("Yes, from July 1st.")).toBeInTheDocument();
  });

  it("shows empty state when there are no messages", () => {
    render(<ThreadClient {...defaultProps} initialMessages={[]} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("aligns my messages to the right and theirs to the left", () => {
    render(<ThreadClient {...defaultProps} />);
    const myMsg = screen.getByText("Yes, from July 1st.").closest("div[class*='justify-']");
    const theirMsg = screen.getByText("Hey, is it available?").closest("div[class*='justify-']");
    expect(myMsg?.className).toContain("justify-end");
    expect(theirMsg?.className).toContain("justify-start");
  });

  it("styles my messages with indigo background", () => {
    render(<ThreadClient {...defaultProps} />);
    const bubble = screen.getByText("Yes, from July 1st.").closest("div[class*='bg-indigo']");
    expect(bubble).toBeTruthy();
  });

  it("styles their messages with white background", () => {
    render(<ThreadClient {...defaultProps} />);
    const bubble = screen.getByText("Hey, is it available?").closest("div[class*='bg-white']");
    expect(bubble).toBeTruthy();
  });
});

// ── Send input ────────────────────────────────────────────────────────────────

describe("message input", () => {
  it("send button is disabled when input is empty", () => {
    render(<ThreadClient {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /send/i });
    expect(btn).toBeDisabled();
  });

  it("send button becomes enabled when input has text", async () => {
    render(<ThreadClient {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(textarea, "Hello!");
    expect(screen.getByRole("button", { name: /send/i })).not.toBeDisabled();
  });

  it("sends message and clears input on button click", async () => {
    render(<ThreadClient {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(textarea, "New message");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("c1", "New message"));
    expect(textarea).toHaveValue("");
  });

  it("Enter key sends the message", async () => {
    render(<ThreadClient {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(textarea, "Sent with Enter");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith("c1", "Sent with Enter"));
  });

  it("Shift+Enter does not send the message", async () => {
    render(<ThreadClient {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(textarea, "Not sent yet");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("refreshes messages after sending", async () => {
    const newMessages = [...baseMessages, { id: "m3", conversation_id: "c1", sender_id: MY_ID, body: "New message", created_at: "2026-06-01T10:02:00Z" }];
    mockFetchMessages.mockResolvedValueOnce(newMessages);
    render(<ThreadClient {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(textarea, "New message");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByText("New message")).toBeInTheDocument());
  });
});

// ── Polling ───────────────────────────────────────────────────────────────────

describe("polling", () => {
  it("polls for new messages every 5 seconds", async () => {
    render(<ThreadClient {...defaultProps} />);
    // Initial mount doesn't count as a poll call
    const callsBefore = mockFetchMessages.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(mockFetchMessages.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

// ── Lister: unconfirmed ───────────────────────────────────────────────────────

describe("lister view (unconfirmed)", () => {
  it("shows the 'Found your person?' banner", () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={null} />);
    expect(screen.getByText(/found your person/i)).toBeInTheDocument();
  });

  it("shows the initial listing rent in the banner", () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={null} initialRentCents={120000} />);
    expect(screen.getByText(/\$1,200\/mo/)).toBeInTheDocument();
  });

  it("opens confirm panel on 'Confirm match' click", async () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={null} />);
    await userEvent.click(screen.getByRole("button", { name: /confirm match/i }));
    expect(screen.getByText(/confirm this match/i)).toBeInTheDocument();
  });

  it("shows base fee for $1,200/mo listing ($49)", async () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={null} initialRentCents={120000} />);
    await userEvent.click(screen.getByRole("button", { name: /confirm match/i }));
    expect(screen.getByText("$49.00")).toBeInTheDocument();
  });

  it("shows base fee for under-$1,000/mo listing ($29)", async () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={null} initialRentCents={80000} />);
    await userEvent.click(screen.getByRole("button", { name: /confirm match/i }));
    expect(screen.getByText("$29.00")).toBeInTheDocument();
  });

  it("shows base fee for $2,000+/mo listing ($79)", async () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={null} initialRentCents={200000} />);
    await userEvent.click(screen.getByRole("button", { name: /confirm match/i }));
    expect(screen.getByText("$79.00")).toBeInTheDocument();
  });

  it("payment button calls createCheckoutSession with correct args", async () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={null} />);
    await userEvent.click(screen.getByRole("button", { name: /confirm match/i }));
    await userEvent.click(screen.getByRole("button", { name: /pay \$/i }));
    await waitFor(() =>
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith("c1")
    );
  });

  it("redirects to Stripe URL after createCheckoutSession", async () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={null} />);
    await userEvent.click(screen.getByRole("button", { name: /confirm match/i }));
    await userEvent.click(screen.getByRole("button", { name: /pay \$/i }));
    await waitFor(() => expect(capturedHref).toBe("https://checkout.stripe.com/test"));
  });

  it("dismiss button (×) closes the confirm panel", async () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={null} />);
    await userEvent.click(screen.getByRole("button", { name: /confirm match/i }));
    expect(screen.getByText("Match confirmation fee")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /×/i }));
    expect(screen.queryByText("Match confirmation fee")).not.toBeInTheDocument();
  });
});

// ── Renter: unconfirmed ───────────────────────────────────────────────────────

describe("renter view (unconfirmed)", () => {
  const renterProps = { ...defaultProps, isLister: false, currentUserId: OTHER_ID };

  it("shows the honest information banner", () => {
    render(<ThreadClient {...renterProps} />);
    expect(screen.getByText(/no payment or action is needed from you/i)).toBeInTheDocument();
  });

  it("does not show the 'Found your person?' lister banner", () => {
    render(<ThreadClient {...renterProps} />);
    expect(screen.queryByText(/found your person/i)).not.toBeInTheDocument();
  });

  it("does not show the confirm match button", () => {
    render(<ThreadClient {...renterProps} />);
    expect(screen.queryByRole("button", { name: /confirm match/i })).not.toBeInTheDocument();
  });
});

// ── Confirmed state ───────────────────────────────────────────────────────────

describe("confirmed state", () => {
  const confirmedAt = "2026-06-02T12:00:00Z";

  it("shows green confirmed banner for lister", () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={confirmedAt} />);
    expect(screen.getByText(/match confirmed/i)).toBeInTheDocument();
  });

  it("shows green confirmed banner for renter", () => {
    render(<ThreadClient {...defaultProps} isLister={false} confirmedAt={confirmedAt} currentUserId={OTHER_ID} />);
    expect(screen.getByText(/match confirmed/i)).toBeInTheDocument();
  });

  it("does not show 'Found your person?' banner when confirmed", () => {
    render(<ThreadClient {...defaultProps} isLister={true} confirmedAt={confirmedAt} />);
    expect(screen.queryByText(/found your person/i)).not.toBeInTheDocument();
  });

  it("does not show renter info banner when confirmed", () => {
    render(<ThreadClient {...defaultProps} isLister={false} confirmedAt={confirmedAt} currentUserId={OTHER_ID} />);
    expect(screen.queryByText(/no payment or action is needed/i)).not.toBeInTheDocument();
  });

});
