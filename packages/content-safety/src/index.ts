import sanitizeHtml from "sanitize-html";

export type HtmlSanitizerProfile = "article";

export interface SanitizeHtmlFragmentOptions {
  baseUrl?: string | null;
  profile?: HtmlSanitizerProfile;
}

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
] as const;

const FORBIDDEN_TAGS = [
  "embed",
  "form",
  "iframe",
  "math",
  "object",
  "script",
  "style",
  "svg",
] as const;

const SAFE_URL_PROTOCOLS = ["http", "https", "mailto"] as const;
const IMAGE_URL_PROTOCOLS = ["http", "https"] as const;
type SanitizeAttributes = Record<string, string | undefined>;

function resolveSafeUrl(
  value: string | undefined,
  baseUrl: string | null | undefined,
  allowedProtocols: readonly string[],
): string | undefined {
  const rawValue = String(value ?? "").trim();
  if (!rawValue || rawValue.startsWith("//")) {
    return undefined;
  }

  try {
    const parsed = baseUrl ? new URL(rawValue, baseUrl) : new URL(rawValue);
    const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
    if (!allowedProtocols.includes(protocol)) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeHtmlFragment(
  rawValue: unknown,
  options: SanitizeHtmlFragmentOptions = {},
): string | null {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null;
  }

  const baseUrl = typeof options.baseUrl === "string" && options.baseUrl.trim()
    ? options.baseUrl.trim()
    : null;

  const sanitized = sanitizeHtml(rawValue, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      abbr: ["title"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: [...SAFE_URL_PROTOCOLS],
    allowedSchemesByTag: {
      img: [...IMAGE_URL_PROTOCOLS],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: [...FORBIDDEN_TAGS],
    parseStyleAttributes: false,
    transformTags: {
      a: (_tagName: string, attribs: SanitizeAttributes) => {
        const href = resolveSafeUrl(attribs.href, baseUrl, SAFE_URL_PROTOCOLS);
        return {
          tagName: "a",
          attribs: {
            ...(href ? { href } : {}),
            ...(attribs.title ? { title: attribs.title } : {}),
            rel: "nofollow noopener noreferrer",
            target: "_blank",
          },
        };
      },
      img: (_tagName: string, attribs: SanitizeAttributes) => {
        const src = resolveSafeUrl(attribs.src, baseUrl, IMAGE_URL_PROTOCOLS);
        return {
          tagName: src ? "img" : "span",
          attribs: src
            ? {
                src,
                ...(attribs.alt ? { alt: attribs.alt } : {}),
                ...(attribs.title ? { title: attribs.title } : {}),
                ...(attribs.width ? { width: attribs.width } : {}),
                ...(attribs.height ? { height: attribs.height } : {}),
                loading: "lazy",
              }
            : {},
        };
      },
    },
  }).trim();

  return sanitized.length > 0 ? sanitized : null;
}
