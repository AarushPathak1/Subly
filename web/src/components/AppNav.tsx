import { auth } from "@clerk/nextjs/server";
import { AppNavUI } from "./AppNavUI";
export { AppNavUI } from "./AppNavUI";
export type { AppNavActive } from "./AppNavUI";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

interface AppNavProps {
  active?: import("./AppNavUI").AppNavActive;
}

async function fetchUnreadCount(token: string): Promise<number> {
  try {
    const res = await fetch(`${GATEWAY}/api/messages/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const convs: { unread_count: number }[] = await res.json();
    return convs.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function AppNav({ active }: AppNavProps) {
  const { getToken } = auth();
  const token = await getToken();
  const unreadCount = token ? await fetchUnreadCount(token) : 0;
  return <AppNavUI active={active} unreadCount={unreadCount} />;
}
