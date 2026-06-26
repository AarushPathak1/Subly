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
    const res = await fetch(`${GATEWAY}/api/messages/conversations/unread_count`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const data: { count: number } = await res.json();
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export async function AppNav({ active }: AppNavProps) {
  const { getToken } = await auth();
  const token = await getToken();
  const unreadCount = token ? await fetchUnreadCount(token) : 0;
  return <AppNavUI active={active} unreadCount={unreadCount} />;
}
