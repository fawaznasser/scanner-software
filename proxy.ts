import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isAllowedRequestOrigin, requestOrigin } from "@/lib/request-origin";

const ADMIN_ROUTES = ["/users", "/statistics", "/logs", "/settings"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/demo-documents")) return new NextResponse(null, { status: 404 });
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    if (!isAllowedRequestOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }
  }
  const isAuthApi = pathname.startsWith("/api/auth/");
  const user = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (isAuthApi) return NextResponse.next();

  if (pathname === "/sign-in") {
    return user ? NextResponse.redirect(new URL("/", requestOrigin(request))) : NextResponse.next();
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const signInUrl = new URL("/sign-in", requestOrigin(request));
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (user.role !== "Administrator" && ADMIN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.redirect(new URL("/", requestOrigin(request)));
  }

  // Redirect before rendering the legacy dynamic route. This also avoids
  // duplicate Location headers when its render-time redirect is replayed.
  if (pathname === "/search") return NextResponse.redirect(new URL("/all-documents", requestOrigin(request)));

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

