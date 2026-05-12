from __future__ import annotations

from urllib.parse import urlparse


DEFAULT_ENDPOINT_PATTERNS = [
    "/feed.xml",
    "/rss.xml",
    "/atom.xml",
    "/blog",
    "/news",
    "/newsroom",
    "/press",
    "/press-releases",
    "/announcements",
    "/insights",
    "/analysis",
    "/docs",
    "/developers",
    "/engineering",
    "/changelog",
    "/release-notes",
    "/releases",
    "/security",
    "/security/advisories",
    "/advisories",
    "/cve",
    "/psirt",
    "/procurement",
    "/tenders",
    "/contracts",
    "/contract-awards",
    "/reports",
    "/research",
    "/publications",
    "/resources",
    "/data",
    "/datasets",
    "/open-data",
    "/downloads",
    "/policy",
    "/policies",
    "/guidance",
    "/regulations",
    "/regulatory",
    "/laws",
    "/standards",
    "/api",
    "/openapi.json",
    "/swagger.json",
    "/newsletter",
    "/archive",
]

POLAND_ENDPOINT_PATTERNS = [
    "/przetargi",
    "/zamowienia",
    "/zamówienia",
    "/postepowania",
    "/postępowania",
    "/bip",
    "/ogloszenia",
    "/ogłoszenia",
]

GERMANY_ENDPOINT_PATTERNS = [
    "/ausschreibungen",
    "/vergaben",
    "/bekanntmachungen",
    "/presse",
    "/meldungen",
    "/aktuelles",
]


def classify_endpoint_kind(url: str, evidence: dict | None = None) -> str:
    del evidence
    lower = url.lower()

    if any(x in lower for x in ["feed.xml", "rss.xml", "atom.xml", "/feed", "/rss"]):
        return "rss_feed"
    if any(x in lower for x in ["openapi.json", "swagger.json"]):
        return "api_openapi"
    if any(x in lower for x in ["/data", "/datasets", "/open-data", "/downloads", "/statistics"]):
        return "dataset"
    if "/api" in lower:
        return "api_openapi"
    if any(x in lower for x in ["/newsroom", "/press", "/press-releases", "/announcements"]):
        return "newsroom"
    if any(x in lower for x in ["/blog", "/insights", "/analysis"]):
        return "blog"
    if any(x in lower for x in ["/changelog", "/release-notes", "/releases"]):
        return "release_notes"
    if any(x in lower for x in ["/security", "/advisories", "/cve", "/psirt"]):
        return "security_advisory"
    if any(
        x in lower
        for x in [
            "/procurement",
            "/tenders",
            "/contracts",
            "/contract-awards",
            "/opportunities",
            "/content/opportunities",
            "/przetargi",
            "/zamowienia",
            "/zamówienia",
            "/postepowania",
            "/postępowania",
            "/bip",
            "/ausschreibungen",
            "/vergaben",
            "/bekanntmachungen",
        ]
    ):
        return "procurement"
    if any(
        host in lower
        for host in [
            "sam.gov",
            "ted.europa.eu",
            "find-tender.service.gov.uk",
            "ezamowienia.gov.pl",
            "service.bund.de",
        ]
    ):
        return "procurement"
    if any(x in lower for x in ["/data", "/datasets", "/open-data"]):
        return "dataset"
    if any(x in lower for x in ["/reports", "/research", "/publications", "/whitepapers"]):
        return "report_library"
    if any(x in lower for x in ["/policy", "/policies", "/guidance", "/regulations", "/regulatory", "/laws", "/standards"]):
        return "regulatory_policy"
    if any(x in lower for x in ["/newsletter", "/archive", "/subscribe"]):
        return "newsletter"
    if any(x in lower for x in ["/resources", "/links", "/directory", "/partners", "/vendors"]):
        return "source_directory"
    return "unknown"


def infer_provider_type(endpoint_kind: str, url: str) -> str:
    lower = url.lower()
    if endpoint_kind == "rss_feed":
        return "rss"
    if endpoint_kind == "api_openapi":
        return "api"
    if "youtube.com" in lower or "youtu.be" in lower:
        return "youtube"
    if any(host in lower for host in ["reddit.com", "x.com", "twitter.com"]):
        return "forum" if "reddit.com" in lower else "social"
    return "website"


def canonical_domain_from_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower().split("@")[-1].split(":")[0]
    return host[4:] if host.startswith("www.") else host
