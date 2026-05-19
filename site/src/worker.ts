const LEGACY_EN_PREFIX = "/en";
const ZH_COUNTRIES = new Set(["CN", "HK", "MO", "SG", "TW"]);

type Env = {
  ASSETS: Fetcher;
};

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const firstSegment = url.pathname.split("/").filter(Boolean)[0];

    if (firstSegment === "en") {
      const target = new URL(request.url);
      target.pathname = url.pathname.slice(LEGACY_EN_PREFIX.length) || "/";
      return Response.redirect(target.toString(), 302);
    }

    if (firstSegment !== "zh") {
      const cookieLocale = parseLocaleCookie(request.headers.get("cookie") || "");
      const locale = cookieLocale ?? detectLocale(request);
      if (locale === "zh") {
        const target = new URL(request.url);
        target.pathname = `/zh${url.pathname === "/" ? "" : url.pathname}`;
        return Response.redirect(target.toString(), 302);
      }
    }

    return env.ASSETS.fetch(request);
  },
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
