const SUPPORTED = new Set(["zh", "en"]);
const LEGACY_PATHS = new Set(["/", "/download", "/docs", "/privacy", "/license", "/updates"]);
const ZH_COUNTRIES = new Set(["CN", "HK", "MO", "SG", "TW"]);

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const firstSegment = url.pathname.split("/").filter(Boolean)[0];
  if (SUPPORTED.has(firstSegment) || !LEGACY_PATHS.has(url.pathname.replace(/\/$/, "") || "/")) {
    return context.next();
  }

  const cookieLocale = parseLocaleCookie(context.request.headers.get("cookie") || "");
  const locale = cookieLocale ?? detectLocale(context.request);
  const target = new URL(context.request.url);
  target.pathname = `/${locale}${url.pathname === "/" ? "" : url.pathname}`;
  return Response.redirect(target.toString(), 302);
};

function parseLocaleCookie(cookie: string) {
  const match = cookie.match(/(?:^|;\s*)opaline_site_language=(zh|en)(?:;|$)/);
  return match?.[1] ?? null;
}

function detectLocale(request: Request) {
  const country = request.cf?.country;
  if (typeof country === "string" && ZH_COUNTRIES.has(country.toUpperCase())) {
    return "zh";
  }

  const acceptLanguage = request.headers.get("accept-language")?.toLowerCase() || "";
  if (acceptLanguage.includes("zh")) {
    return "zh";
  }
  return "en";
}
