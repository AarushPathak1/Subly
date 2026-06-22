import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetchMessages = vi.fn();
const mockSendMessage = vi.fn();
const mockCreateCheckoutSession = vi.fn();
const mockProposeViewing = vi.fn();
const mockRespondToViewing = vi.fn();
const mockCalculateMatchFee = vi.fn((cents: number) =>
  cents < 100000 ? 2900 : cents < 200000 ? 4900 : 7900
);
const mockCapture = vi.fn();

vi.mock("@/lib/actions", () => ({
  fetchMessages: (...args: unknown[]) => mockFetchMessages(...args),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  createCheckoutSession: (...args: unknown[]) => mockCreateCheckoutSession(...args),
  proposeViewing: (...args: unknown[]) => mockProposeViewing(...args),
  respondToViewing: (...args: unknown[]) => mockRespondToViewing(...args),
}));

vi.mock("@/lib/fees", () => ({
  calculateMatchFee: (cents: number) => mockCalculateMatchFee(cents),
}));

vi.mock("@/lib/posthog/client", () => ({
  capture: (...args: unknown[]) => mockCapture(...args),
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
  { id: "m1", conversation_id: "c1", sender_id: OTHER_ID, body: "Hey, is it available?", created_at: "2026-06-01T10:00:00Z", kind: "text" as const },
  { id: "m2", conversation_id: "c1", sender_id: MY_ID,    body: "Yes, from July 1st.",    created_at: "2026-06-01T10:01:00Z", kind: "text" as const },
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
  mockProposeViewing.mockResolvedValue({});
  mockRespondToViewing.mockResolvedValue({});
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
    const newMessages = [...baseMessages, { id: "m3", conversation_id: "c1", sender_id: MY_ID, body: "New message", created_at: "2026-06-01T10:02:00Z", kind: "text" as const }];
    mockFetchMessages.mockResolvedValueOnce(newMessages);
    render(<ThreadClient {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(textarea, "New message");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByText("New message")).toBeInTheDocument());
  });

  it("fires message_sent after a successful send with correct properties", async () => {
    render(<ThreadClient {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(textarea, "New message");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(mockCapture).toHaveBeenCalledWith("message_sent", {
        conversation_id: "c1",
        is_lister: true,
        message_length: "New message".length,
      })
    );
  });

  it("does not fire message_sent when send fails", async () => {
    mockSendMessage.mockResolvedValueOnce({ error: "Failed to send message" });
    render(<ThreadClient {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(textarea, "Will fail");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled());
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

// ── Polling ───────────────────────────────────────────────────────────────────

describe("polling", () => {
  it("polls for new messages every 30 seconds", async () => {
    render(<ThreadClient {...defaultProps} />);
    // Initial mount doesn't count as a poll call
    const callsBefore = mockFetchMessages.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(30000); });
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

// ── Viewing scheduler ─────────────────────────────────────────────────────────

describe("propose-a-time button", () => {
  it("is enabled when conversation is not confirmed", () => {
    render(<ThreadClient {...defaultProps} confirmedAt={null} />);
    expect(screen.getByRole("button", { name: /propose a time/i })).not.toBeDisabled();
  });

  it("is disabled when conversation is confirmed", () => {
    render(<ThreadClient {...defaultProps} confirmedAt="2026-06-02T12:00:00Z" />);
    expect(screen.getByRole("button", { name: /propose a time/i })).toBeDisabled();
  });

  it("opens the ProposeViewingModal on click", async () => {
    render(<ThreadClient {...defaultProps} confirmedAt={null} />);
    await userEvent.click(screen.getByRole("button", { name: /propose a time/i }));
    expect(screen.getByText(/propose a viewing time/i)).toBeInTheDocument();
  });

  it("closes the modal on Cancel", async () => {
    render(<ThreadClient {...defaultProps} confirmedAt={null} />);
    await userEvent.click(screen.getByRole("button", { name: /propose a time/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/propose a viewing time/i)).not.toBeInTheDocument();
  });
});

describe("submitting a viewing proposal", () => {
  async function openModalAndSubmit(proposedAt = "2026-07-05T18:30") {
    await userEvent.click(screen.getByRole("button", { name: /propose a time/i }));
    fireEvent.change(screen.getByLabelText(/date & time/i), { target: { value: proposedAt } });
    const heading = screen.getByText(/propose a viewing time/i);
    const modal = heading.closest("div.fixed") as HTMLElement;
    await userEvent.click(within(modal).getByRole("button", { name: /^send$/i }));
  }

  it("calls proposeViewing with the conversation id and ISO datetime", async () => {
    render(<ThreadClient {...defaultProps} confirmedAt={null} />);
    await openModalAndSubmit();
    await waitFor(() => expect(mockProposeViewing).toHaveBeenCalled());
    const [convId, isoArg] = mockProposeViewing.mock.calls[0];
    expect(convId).toBe("c1");
    expect(isoArg).toBe(new Date("2026-07-05T18:30").toISOString());
  });

  it("closes the modal and refreshes messages on success", async () => {
    const withProposal = [
      ...baseMessages,
      {
        id: "m3",
        conversation_id: "c1",
        sender_id: MY_ID,
        body: "Proposed viewing: 2026-07-05 18:30 UTC",
        created_at: "2026-06-01T10:02:00Z",
        kind: "viewing_proposal" as const,
        viewing: {
          proposed_at: "2026-07-05T18:30:00Z",
          status: "pending" as const,
          responded_at: null,
          responder_id: null,
        },
      },
    ];
    mockFetchMessages.mockResolvedValueOnce(withProposal);
    render(<ThreadClient {...defaultProps} confirmedAt={null} />);
    await openModalAndSubmit();
    await waitFor(() => expect(screen.queryByText(/propose a viewing time/i)).not.toBeInTheDocument());
    expect(mockFetchMessages).toHaveBeenCalled();
  });

  it("keeps the modal open and shows an error message when proposeViewing fails", async () => {
    mockProposeViewing.mockResolvedValueOnce({ error: "This match is already confirmed — no viewing needed." });
    render(<ThreadClient {...defaultProps} confirmedAt={null} />);
    const callsBefore = mockFetchMessages.mock.calls.length;
    await openModalAndSubmit();
    await waitFor(() => expect(mockProposeViewing).toHaveBeenCalled());
    // The modal stays open and the user now sees an error message instead of
    // silent failure, and messages are not refetched since nothing changed.
    expect(screen.getByText(/propose a viewing time/i)).toBeInTheDocument();
    expect(screen.getByText(/this match is already confirmed/i)).toBeInTheDocument();
    expect(mockFetchMessages.mock.calls.length).toBe(callsBefore);
  });
});

describe("viewing_proposal message rendering", () => {
  const proposalMessage = {
    id: "m3",
    conversation_id: "c1",
    sender_id: OTHER_ID,
    body: "Proposed viewing: 2026-07-05 18:30 UTC",
    created_at: "2026-06-01T10:02:00Z",
    kind: "viewing_proposal" as const,
    viewing: {
      proposed_at: "2026-07-05T18:30:00Z",
      status: "pending" as const,
      responded_at: null,
      responder_id: null,
    },
  };

  it("renders a ViewingProposalCard instead of a plain text bubble", () => {
    render(<ThreadClient {...defaultProps} initialMessages={[...baseMessages, proposalMessage]} />);
    expect(screen.getByText(/viewing proposal/i)).toBeInTheDocument();
  });

  it("shows Accept/Decline for the recipient and calls respondToViewing on Accept", async () => {
    render(<ThreadClient {...defaultProps} initialMessages={[...baseMessages, proposalMessage]} currentUserId={MY_ID} />);
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() =>
      expect(mockRespondToViewing).toHaveBeenCalledWith("c1", proposalMessage.id, "accept")
    );
  });

  it("calls respondToViewing with 'decline' on Decline", async () => {
    render(<ThreadClient {...defaultProps} initialMessages={[...baseMessages, proposalMessage]} currentUserId={MY_ID} />);
    await userEvent.click(screen.getByRole("button", { name: /decline/i }));
    await waitFor(() =>
      expect(mockRespondToViewing).toHaveBeenCalledWith("c1", proposalMessage.id, "decline")
    );
  });

  it("refreshes messages after a successful respond", async () => {
    render(<ThreadClient {...defaultProps} initialMessages={[...baseMessages, proposalMessage]} currentUserId={MY_ID} />);
    const callsBefore = mockFetchMessages.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => expect(mockFetchMessages.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("refreshes messages and shows an error message when respond fails", async () => {
    mockRespondToViewing.mockResolvedValueOnce({ error: "This proposal was already answered. Refresh to see the latest." });
    render(<ThreadClient {...defaultProps} initialMessages={[...baseMessages, proposalMessage]} currentUserId={MY_ID} />);
    const callsBefore = mockFetchMessages.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => expect(mockRespondToViewing).toHaveBeenCalled());
    // On failure (e.g. someone else already responded), the component
    // re-fetches messages so the UI reflects the true server-side state, and
    // the user sees an error message instead of silent failure.
    await waitFor(() => expect(mockFetchMessages.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(screen.getByText(/this proposal was already answered/i)).toBeInTheDocument();
  });

  it("shows waiting text instead of buttons when I am the sender", () => {
    const mine = { ...proposalMessage, sender_id: MY_ID };
    render(<ThreadClient {...defaultProps} initialMessages={[...baseMessages, mine]} currentUserId={MY_ID} />);
    expect(screen.getByText(/waiting for the other party to respond/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });
});
