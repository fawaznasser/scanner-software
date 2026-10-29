"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DmsUser } from "@/data/users";

export function useSession() {
  const [user, setUser] = useState<DmsUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unauthenticated");
        const data = await response.json() as { user: DmsUser };
        if (active) setUser(data.user);
      })
      .catch(() => {
        if (active) router.replace("/sign-in");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const sendHeartbeat = () => {
      if (document.visibilityState === "visible") {
        void fetch("/api/presence", { method: "POST", cache: "no-store", keepalive: true });
      }
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 20_000);
    window.addEventListener("focus", sendHeartbeat);
    document.addEventListener("visibilitychange", sendHeartbeat);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", sendHeartbeat);
      document.removeEventListener("visibilitychange", sendHeartbeat);
    };
  }, [user]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/sign-out", { method: "POST" });
    setUser(null);
    router.replace("/sign-in");
    router.refresh();
  }, [router]);

  return { user, loading, signOut };
}

