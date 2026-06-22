import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ViewingProposalCard } from "@/app/messages/[id]/ViewingProposalCard";
import type { ChatMessage, ViewingStatus } from "@/lib/actions";

const SENDER_ID = "user-sender-1";
const OTHER_ID = "user-other-1";

function makeMessage(overrides: Partial<ChatMessage> & { viewing: ChatMessage["viewing"] }): ChatMessage {
  return {
    id: "m1",
    conversation_id: "c1",
    sender_id: SENDER_ID,
    body: "Proposed viewing: 2026-07-05 18:30 UTC",
    created_at: "2026-06-01T10:00:00Z",
    kind: "viewing_proposal",
    ...overrides,
  };
}

const baseViewing = {
  proposed_at: "2026-07-05T18:30:00Z",
  status: "pending" as ViewingStatus,
  responded_at: null,
  responder_id: null,
};

describe("ViewingProposalCard", () => {
  it("renders the formatted proposed time", () => {
    const message = makeMessage({ viewing: baseViewing });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={OTHER_ID}
        listingTitle="Sunny Studio"
        onRespond={vi.fn()}
      />
    );
    const expected = new Date(baseViewing.proposed_at).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("renders the listing title", () => {
    const message = makeMessage({ viewing: baseViewing });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={OTHER_ID}
        listingTitle="Sunny Studio"
        onRespond={vi.fn()}
      />
    );
    expect(screen.getByText("Sunny Studio")).toBeInTheDocument();
  });

  it("renders the note when present", () => {
    const message = makeMessage({ viewing: { ...baseViewing, note: "Happy to give a tour then." } });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={OTHER_ID}
        listingTitle="Sunny Studio"
        onRespond={vi.fn()}
      />
    );
    expect(screen.getByText(/Happy to give a tour then\./)).toBeInTheDocument();
  });

  it("shows Accept/Decline buttons for non-sender when pending", () => {
    const message = makeMessage({ viewing: baseViewing });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={OTHER_ID}
        listingTitle="Sunny Studio"
        onRespond={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
  });

  it("does not show Accept/Decline buttons for the sender", () => {
    const message = makeMessage({ viewing: baseViewing });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={SENDER_ID}
        listingTitle="Sunny Studio"
        onRespond={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /decline/i })).not.toBeInTheDocument();
  });

  it("does not show Accept/Decline buttons when not pending", () => {
    const message = makeMessage({ viewing: { ...baseViewing, status: "accepted" } });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={OTHER_ID}
        listingTitle="Sunny Studio"
        onRespond={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  it("shows waiting text for sender when pending", () => {
    const message = makeMessage({ viewing: baseViewing });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={SENDER_ID}
        listingTitle="Sunny Studio"
        onRespond={vi.fn()}
      />
    );
    expect(screen.getByText(/waiting for the other party to respond/i)).toBeInTheDocument();
  });

  it.each<[ViewingStatus, RegExp]>([
    ["pending", /awaiting response/i],
    ["accepted", /accepted/i],
    ["declined", /declined/i],
    ["superseded", /replaced by newer proposal/i],
  ])("shows the correct status pill for %s", (status, expectedText) => {
    const message = makeMessage({ viewing: { ...baseViewing, status } });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={OTHER_ID}
        listingTitle="Sunny Studio"
        onRespond={vi.fn()}
      />
    );
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it("calls onRespond with messageId and 'accept' when Accept is clicked", async () => {
    const onRespond = vi.fn();
    const message = makeMessage({ viewing: baseViewing });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={OTHER_ID}
        listingTitle="Sunny Studio"
        onRespond={onRespond}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onRespond).toHaveBeenCalledWith(message.id, "accept");
  });

  it("calls onRespond with messageId and 'decline' when Decline is clicked", async () => {
    const onRespond = vi.fn();
    const message = makeMessage({ viewing: baseViewing });
    render(
      <ViewingProposalCard
        message={message}
        currentUserId={OTHER_ID}
        listingTitle="Sunny Studio"
        onRespond={onRespond}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /decline/i }));
    expect(onRespond).toHaveBeenCalledWith(message.id, "decline");
  });

  it("renders nothing when viewing is null", () => {
    const message = makeMessage({ viewing: null });
    const { container } = render(
      <ViewingProposalCard
        message={message}
        currentUserId={OTHER_ID}
        listingTitle="Sunny Studio"
        onRespond={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
