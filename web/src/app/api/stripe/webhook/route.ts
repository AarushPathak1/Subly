import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:8080";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const conversationId = session.metadata?.conversation_id;
    const includesAgreement = session.metadata?.includes_agreement === "true";

    if (conversationId && session.payment_status === "paid") {
      // Best-effort backup confirmation — primary path is the success page.
      // Uses an internal service header to bypass user auth on the listings service.
      await fetch(`${GATEWAY}/api/messages/conversations/${conversationId}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": process.env.INTERNAL_SECRET ?? "",
        },
        body: JSON.stringify({
          stripe_session_id: session.id,
          includes_agreement: includesAgreement,
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ received: true });
}
