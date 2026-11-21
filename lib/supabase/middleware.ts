import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl, isSupabaseConfigured } from "@/lib/env";
import { canAccessPath, homeForRole, isPublicPath, isRole } from "@/lib/auth/roles";

/**
 * Runs on every page request:
 *  1. Refreshes the Supabase session cookie.
 *  2. Sends signed-out users to /login.
 *  3. Rewrites to the 403 page when the user's role cannot open the route.
 *
 * The role is read from the verified JWT (`app_metadata.role`, which only the
 * server / a DB trigger can set). Server layouts re-check it against the
 * `profiles` table, so this is a fast first gate, not the only one.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) {
    // Let the login page explain the missing configuration.
    return isPublicPath(pathname) ? response : redirectTo(request, "/login", response);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not put code between createServerClient and getClaims (session refresh happens here).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  // API routes do their own auth and return JSON errors, never redirects.
  if (pathname.startsWith("/api")) return response;

  if (!claims) {
    if (isPublicPath(pathname)) return response;
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return redirectTo(request, `/login${next}`, response);
  }

  const tokenRole = (claims.app_metadata as { role?: unknown } | undefined)?.role;
  // The JWT can be up to an hour old after an admin changes someone's role
  // (e.g. appointed HOD). On a mismatch we confirm against the database.
  const dbRole = async () => {
    const { data: p } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
    return isRole(p?.role) ? p.role : null;
  };

  const role = isRole(tokenRole) ? tokenRole : await dbRole();
  if (!role) {
    return pathname.startsWith("/forbidden")
      ? response
      : redirectTo(request, "/forbidden?reason=no-role", response);
  }

  if (pathname === "/" || pathname === "/login" || pathname === "/signup") {
    return redirectTo(request, homeForRole((await dbRole()) ?? role), response);
  }

  if (!canAccessPath(role, pathname) && !canAccessPath((await dbRole()) ?? role, pathname)) {
    // Keep the URL, show the 403 page with a real 403 status.
    const rewrite = NextResponse.rewrite(new URL("/forbidden", request.url), { status: 403 });
    copyCookies(response, rewrite);
    return rewrite;
  }

  return response;
}

function redirectTo(request: NextRequest, path: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  copyCookies(from, redirect);
  return redirect;
}

/** Carry refreshed auth cookies over to a redirect / rewrite response. */
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  const cacheControl = from.headers.get("cache-control");
  if (cacheControl) to.headers.set("cache-control", cacheControl);
}
