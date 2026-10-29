import { readJsonObject } from "@/lib/request-body";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { UserRole } from "@/data/users";
import { getAuditLogs } from "@/lib/audit-log";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getDmsUsers, updateDmsUserRole } from "@/lib/user-store";
import { getUserPresence } from "@/lib/presence-store";
import { db } from "@/lib/database";

async function getRequestUser() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

function getLiveUsers(currentUserId: string) {
  const logs = getAuditLogs();
  const counts = db().prepare("SELECT owner_id, visibility, COUNT(*) AS total FROM documents WHERE json_extract(record, '$.category') != 'Trash' GROUP BY owner_id, visibility").all() as { owner_id: string; visibility: string; total: number }[];

  return getDmsUsers().map((user) => {
    const userLogs = logs.filter((log) => log.userId === user.id);
    const latestActivity = userLogs[0] ?? null;
    const presence = getUserPresence(user.id);
    const latestActivityTime = latestActivity ? new Date(latestActivity.timestamp).getTime() : 0;
    const lastActiveTime = Math.max(presence.lastSeenAt ?? 0, latestActivityTime);
    const owned = counts.filter((count) => count.owner_id === user.id);
    const privateDocumentCount = owned.find((count) => count.visibility === "private")?.total ?? 0;
    const publicDocumentCount = owned.find((count) => count.visibility === "public")?.total ?? 0;

    return {
      ...user,
      status: presence.online ? "Online" as const : "Offline" as const,
      lastActiveAt: lastActiveTime ? new Date(lastActiveTime).toISOString() : null,
      documentCount: privateDocumentCount + publicDocumentCount,
      privateDocumentCount,
      publicDocumentCount,
      isCurrentUser: user.id === currentUserId,
    };
  });
}

export async function GET() {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (user.role !== "Administrator") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  return NextResponse.json(
    { users: getLiveUsers(user.id), generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const currentUser = await getRequestUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (currentUser.role !== "Administrator") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  let input: { userId?: unknown; role?: unknown };
  try {
    input = await readJsonObject(request);
  } catch {
    return NextResponse.json({ error: "Invalid user data" }, { status: 400 });
  }

  if (typeof input.userId !== "string" || (input.role !== "Administrator" && input.role !== "Editor")) {
    return NextResponse.json({ error: "A valid user and role are required" }, { status: 400 });
  }
  if (input.userId === currentUser.id) {
    return NextResponse.json({ error: "You cannot change your own administrator role" }, { status: 400 });
  }

  const updated = updateDmsUserRole(input.userId, input.role as UserRole);
  if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ user: updated });
}
