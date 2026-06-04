import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import {
  createHarness,
  createLogger,
  readEnvFile,
} from "./lib/mcp-http-testkit.mjs";

const log = createLogger("outsourcing-rescue");

const SHORT_WAIT_MS = 10_000;
const CONTENT_WAIT_MS = 4 * 60 * 1000;
const DISCOVERY_WAIT_MS = 15 * 60 * 1000;

const EXCLUDED_GEO_CONSTRAINTS = {
  excludedCountries: ["Russia", "China"],
  excludedCountryCodes: ["RU", "CN"],
  excludedDomains: [".ru", ".рф", ".cn"],
  note:
    "Provider search can return stray pages; reject or mark noise when candidate evidence is Russia/China-centered.",
};

const COMMON_NEGATIVES = [
  "Russia-centered or China-centered source unless the page is explicitly about non-Russia/non-China buyer demand",
  "outsourcing agency service page without buyer-authored project evidence",
  "top software companies, best agencies, top developers, review/ranking article",
  "vendor marketing page, service landing page, demo page, privacy/security page, case study without active buyer ask",
  "category, tag, search, profile, homepage, or listing wrapper without project details",
  "generic how-to article, RFP response guide, procurement advice, tutorial, market report, or SEO page",
  "jobs-only page without vendor, contractor, RFP, proposal, or external delivery ask",
];

const NEW_HYPOTHESIS_PACKS = [
  {
    key: "civic_case_management_permitting_rfp",
    name: "Civic case-management permitting RFP signals",
    mode: "item_detail",
    description:
      "Find official city/county/public-agency RFP or solicitation item pages for permitting, licensing, inspections, case management, CRM, citizen-service portals and workflow modernization.",
    geographies: ["global"],
    languages: ["en", "fr", "es", "de", "pt", "pl", "nl"],
    allowedContentKinds: ["editorial", "listing", "document", "api_payload", "data_file"],
    positiveTexts: [
      "city county RFP permitting software case management implementation vendor deadline",
      "public agency solicitation licensing inspections workflow modernization system integrator",
      "government request for proposal citizen services portal CRM implementation support",
      "municipal procurement software replacement digital permitting case management platform",
    ],
    negativeTexts: [
      ...COMMON_NEGATIVES,
      "policy meeting agenda or staff report without procurement submission path",
      "software vendor product page for permitting or case management",
      "completed case study award announcement without active solicitation",
    ],
    candidatePositiveSignals: [
      "official_buyer: city, county, municipality, public agency, department, council, authority",
      "procurement_process: RFP, RFQ, solicitation, request for proposals, addendum, bid due, proposal deadline, procurement id",
      "delivery_scope: permitting software, licensing system, inspections workflow, case management, CRM, citizen portal, implementation, integration, data migration",
    ],
    candidateNegativeSignals: [
      "seller_product: vendor product/service page or implementation partner marketing",
      "context_only: meeting minutes, agenda, policy page or procurement portal home without item detail",
      "closed_only: award notice, contract execution or completed project with no active vendor search",
    ],
    evidenceTerms: ["RFP", "solicitation", "permitting", "case management", "CRM", "portal", "implementation", "deadline", "proposal"],
  },
  {
    key: "erp_crm_migration_partner_procurement",
    name: "ERP CRM migration partner procurement",
    mode: "item_detail",
    description:
      "Find public buyer item-level notices for ERP, CRM, finance, HR, grant-management, student-information or records-system implementation/migration partner needs.",
    geographies: ["global"],
    languages: ["en", "fr", "es", "de", "pt", "pl", "nl"],
    allowedContentKinds: ["editorial", "listing", "document", "api_payload", "data_file"],
    positiveTexts: [
      "ERP implementation partner RFP data migration integration public sector",
      "CRM replacement procurement implementation services vendor proposal deadline",
      "finance HR student information system migration support request for proposal",
      "grant management records management system integrator tender implementation",
    ],
    negativeTexts: [
      ...COMMON_NEGATIVES,
      "ERP vendor landing page partner directory product comparison",
      "job posting for ERP administrator analyst developer employee",
      "completed award only or software license purchase without implementation scope",
    ],
    candidatePositiveSignals: [
      "buyer_process: RFP, tender, solicitation, proposal due, procurement number, contact, submission instructions",
      "system_scope: ERP, CRM, HRIS, finance system, student information system, grant management, records management",
      "implementation_need: migration, integration, configuration, customization, support, managed services, systems integrator",
    ],
    candidateNegativeSignals: [
      "license_or_hardware_only: pure SaaS license renewal, device purchase, subscription with no delivery scope",
      "jobs_only: employee or contractor role without vendor procurement",
      "seller_content: vendor blog, partner directory, product guide, implementation services page",
    ],
    evidenceTerms: ["ERP", "CRM", "implementation", "migration", "integration", "RFP", "tender", "proposal", "system integrator"],
  },
  {
    key: "website_portal_rebuild_official_rfp",
    name: "Website portal rebuild official RFP",
    mode: "negative_first",
    description:
      "Find official RFP/RFQ pages where public, nonprofit, education or health buyers ask for website redesign, portal rebuild, CMS implementation, accessibility remediation or digital-experience delivery.",
    geographies: ["global"],
    languages: ["en", "fr", "es", "de", "pt", "pl", "nl"],
    allowedContentKinds: ["editorial", "listing", "document"],
    positiveTexts: [
      "request for proposal website redesign CMS implementation vendor",
      "RFP web portal rebuild accessibility digital experience deadline",
      "RFQ website development public agency nonprofit proposal",
      "procurement web application portal modernization content management system",
    ],
    negativeTexts: [
      ...COMMON_NEGATIVES,
      "web design agency portfolio service landing page",
      "template marketplace theme plugin tutorial",
      "blog post about how to write website RFP",
      "career page web developer job",
    ],
    candidatePositiveSignals: [
      "buyer_request: RFP, RFQ, request for proposal, bid, proposal deadline, submission instructions",
      "web_delivery_scope: website redesign, portal rebuild, CMS, web application, accessibility, UX, content migration, hosting/support",
      "buyer_identity: public agency, school, university, nonprofit, association, health provider, city, county",
    ],
    candidateNegativeSignals: [
      "seller_page: agency portfolio, service page, pricing page, case study, lead magnet",
      "advice_or_template: RFP writing guide, template, checklist, tutorial",
      "jobs_or_directory: web developer job, agency directory, freelancer profile",
    ],
    evidenceTerms: ["RFP", "RFQ", "website redesign", "CMS", "portal", "accessibility", "proposal", "deadline", "vendor"],
  },
  {
    key: "healthcare_integration_patient_portal_rfp",
    name: "Healthcare integration patient portal RFP",
    mode: "item_detail",
    description:
      "Find hospitals, public-health agencies, clinics, health authorities and medical nonprofits requesting patient portals, EHR integrations, data platforms, referral systems, analytics or interoperability delivery.",
    geographies: ["global"],
    languages: ["en", "fr", "es", "de", "pt", "pl", "nl"],
    allowedContentKinds: ["editorial", "listing", "document", "api_payload"],
    positiveTexts: [
      "hospital RFP patient portal implementation integration vendor deadline",
      "health authority tender EHR integration data platform interoperability software",
      "public health request for proposal referral system case management digital platform",
      "healthcare procurement API integration analytics platform implementation partner",
    ],
    negativeTexts: [
      ...COMMON_NEGATIVES,
      "patient portal software comparison page product review",
      "healthcare SaaS vendor service page demo",
      "medical job posting or clinical staffing solicitation without software delivery",
      "device supply only or medical equipment tender",
    ],
    candidatePositiveSignals: [
      "health_buyer: hospital, health authority, public health department, clinic network, medical nonprofit",
      "procurement_process: RFP, tender, RFQ, solicitation, proposal deadline, procurement id, submission instructions",
      "delivery_scope: patient portal, EHR integration, interoperability, referral system, data platform, analytics, case management, implementation",
    ],
    candidateNegativeSignals: [
      "vendor_comparison: software advice, product review, demo page, pricing page",
      "clinical_or_device_only: staffing, medical equipment, supplies, clinical service without software delivery",
      "closed_award_or_context: award notice or policy page without active vendor search",
    ],
    evidenceTerms: ["hospital", "health", "patient portal", "EHR", "interoperability", "RFP", "tender", "integration", "implementation"],
  },
  {
    key: "nonprofit_education_grant_digital_delivery",
    name: "Nonprofit education grant digital delivery",
    mode: "negative_first",
    description:
      "Find nonprofits, universities, schools, research institutes and grant-funded programs issuing RFPs for digital platforms, learning systems, data tools, community portals or implementation partners.",
    geographies: ["global"],
    languages: ["en", "fr", "es", "de", "pt", "pl", "nl"],
    allowedContentKinds: ["editorial", "listing", "document"],
    positiveTexts: [
      "nonprofit RFP digital platform implementation vendor",
      "university request for proposal learning management system integration",
      "grant funded project software development procurement implementation partner",
      "education research institute RFP data portal web application deadline",
    ],
    negativeTexts: [
      ...COMMON_NEGATIVES,
      "grant announcement without implementation procurement",
      "scholarship fellowship application or call for proposals without software vendor need",
      "donor report impact story portfolio page",
      "job posting for education technology employee",
    ],
    candidatePositiveSignals: [
      "buyer_identity: nonprofit, university, school district, research institute, foundation, grant-funded program",
      "buyer_process: RFP, RFQ, procurement, proposal deadline, vendor questions, submission instructions",
      "delivery_scope: digital platform, learning system, LMS, data portal, web application, community portal, implementation, integration",
    ],
    candidateNegativeSignals: [
      "grant_context_only: grant award, call for research proposals, fellowship, scholarship, impact report",
      "seller_or_jobs: vendor service page, edtech product page, employee job posting",
      "wrapper_only: procurement page, events page, news page without item-level RFP",
    ],
    evidenceTerms: ["nonprofit", "university", "RFP", "digital platform", "LMS", "data portal", "implementation", "vendor", "deadline"],
  },
];

const WEB_EXPANSION_PACKS = [
  {
    key: "official_open_contracting_web_apis",
    name: "Official open contracting web and API item signals",
    mode: "item_detail",
    description:
      "Find official open contracting portals and item-detail APIs where public buyers publish live software, IT services, digital platform, implementation or integration opportunities.",
    geographies: ["global"],
    languages: ["en", "fr", "es", "de", "pt", "pl", "nl", "it"],
    allowedContentKinds: ["editorial", "listing", "document", "api_payload", "data_file"],
    positiveTexts: [
      "official open contracting OCDS API software development tender opportunity",
      "contracts finder find a tender procurement notice digital platform IT services",
      "public contracts portal RFP RFQ solicitation software implementation integration deadline",
      "government procurement API contract notice web application development data system",
    ],
    negativeTexts: COMMON_NEGATIVES,
    candidatePositiveSignals: [
      "official_surface: government or official open contracting portal/API, OCDS, contract notice, procurement notice",
      "buyer_item_detail: notice id, OCID, buyer, procurement stage, deadline, contact, documents, submission path",
      "software_delivery_scope: software development, digital platform, IT services, integration, data system, web application, implementation",
    ],
    candidateNegativeSignals: [
      "portal_home_only: search/help/API documentation without a concrete notice item",
      "award_only: closed award, supplier already selected, historical spend only",
      "seller_or_aggregator: paid tender aggregator, agency service page, guide, profile or ranking page",
    ],
    evidenceTerms: ["ocds", "contract notice", "tender", "rfp", "rfq", "software", "IT services", "deadline", "buyer", "submission"],
  },
  {
    key: "municipal_university_health_procurement",
    name: "Municipal university health procurement item signals",
    mode: "item_detail",
    description:
      "Find city, university, school district, hospital and public-health procurement item pages where smaller public buyers request software delivery, portals, integrations or modernization.",
    geographies: ["global"],
    languages: ["en", "fr", "es", "de", "pt", "pl", "nl"],
    allowedContentKinds: ["editorial", "listing", "document"],
    positiveTexts: [
      "city procurement software development RFP portal implementation deadline",
      "university request for proposal web application development integration",
      "hospital tender digital platform patient portal data system vendor",
      "school district RFQ software implementation modernization services",
    ],
    negativeTexts: COMMON_NEGATIVES,
    candidatePositiveSignals: [
      "public_buyer: city, county, municipality, university, school district, hospital, health authority",
      "project_notice: RFP, RFQ, tender, solicitation, request for proposal, procurement item detail",
      "implementation_scope: portal, website rebuild, web app, integration, data system, case management, CRM, modernization",
    ],
    candidateNegativeSignals: [
      "job_or_staffing_only: employee recruitment, role, CV, job posting",
      "vendor_case_study: supplier blog/case study about a completed public project",
      "portal_wrapper: bid list/search/category page without item detail",
    ],
    evidenceTerms: ["city", "university", "hospital", "RFP", "RFQ", "software", "portal", "integration", "deadline", "proposal"],
  },
  {
    key: "project_ask_web_negative_first",
    name: "Project ask web negative-first",
    mode: "negative_first",
    description:
      "Find web/forum/community/project-board posts where a buyer or product owner asks for external developers, an agency, contractor team or implementation partner. Use broad recall and strong seller/wrapper/jobs-only vetoes.",
    geographies: ["global"],
    languages: ["en", "fr", "es", "de", "pt", "pl", "nl"],
    allowedContentKinds: ["editorial", "listing", "document"],
    positiveTexts: [
      "looking for developers to build web app project budget",
      "need agency contractor team software platform integration",
      "seeking development partner MVP app marketplace SaaS",
      "request proposal build custom software automation portal",
    ],
    negativeTexts: [
      ...COMMON_NEGATIVES,
      "seller profile freelancer profile agency directory marketplace category page",
      "internal job post career page recruiter hiring employee only",
      "recommendation list or advice thread without a current project owner asking for delivery",
    ],
    candidatePositiveSignals: [
      "buyer_phrase: looking for, need, seeking, request, want to build, project owner, budget, timeline",
      "external_delivery: agency, contractor, dev team, development partner, vendor, proposal, fixed price",
      "software_project: web app, mobile app, SaaS, API, integration, automation, marketplace, platform, CRM",
    ],
    candidateNegativeSignals: [
      "seller_profile: freelancer/agency profile, directory, portfolio, service landing page",
      "jobs_only: employment job board or recruiter post without vendor/contractor option",
      "generic_discussion: advice, tutorial, recommendations or tool comparison without current buyer ask",
    ],
    evidenceTerms: ["looking for", "need", "seeking", "agency", "contractor", "development partner", "budget", "timeline", "project"],
  },
];

const RESCUE_PACKS = [
  ...NEW_HYPOTHESIS_PACKS,
  ...WEB_EXPANSION_PACKS,
  {
    key: "official_procurement_item_details",
    name: "Official procurement item-detail software signals",
    mode: "item_detail",
    description:
      "Find official RFP, RFQ, tender and contract opportunity detail pages for software development, app development, integration, data platforms, AI systems and modernization.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "nl", "it"],
    allowedContentKinds: ["editorial", "listing", "document", "api_payload", "data_file"],
    positiveTexts: [
      "official contract opportunity software development RFP detail page",
      "tender notice app development integration data platform deadline",
      "RFQ RFP software implementation modernization vendor proposal due date",
      "procurement notice IT services custom software project solicitation",
    ],
    negativeTexts: COMMON_NEGATIVES,
    candidatePositiveSignals: [
      "buyer_notice: official RFP/RFQ/tender/solicitation/contract opportunity item detail",
      "software_scope: app development, integration, implementation, data system, modernization, AI platform, portal",
      "commercial_evidence: due date, buyer agency, budget/award/procurement id, contact, proposal instructions",
    ],
    candidateNegativeSignals: [
      "source_homepage_only: official portal home/search page without item details",
      "seller_promo: vendor service page or RFP response guide",
      "expired_context_only: old/closed archive with no current procurement path",
    ],
    evidenceTerms: ["rfp", "rfq", "tender", "solicitation", "software", "development", "implementation", "integration", "deadline", "proposal"],
  },
  {
    key: "multilateral_digital_tenders",
    name: "Multilateral digital tender item signals",
    mode: "item_detail",
    description:
      "Find UNGM, World Bank, EBRD, EU and aid-funded procurement notices where a buyer is requesting software, IT services, implementation or digital platform delivery.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "it"],
    allowedContentKinds: ["editorial", "listing", "document", "api_payload", "data_file"],
    positiveTexts: [
      "UNGM procurement software development tender notice",
      "World Bank procurement notice digital platform IT services",
      "EBRD tender software implementation consultant procurement",
      "EU funding tender digital services software project deadline",
    ],
    negativeTexts: COMMON_NEGATIVES,
    candidatePositiveSignals: [
      "official_multilateral_notice: UNGM, World Bank, EBRD, EU, development-bank or aid procurement item",
      "delivery_scope: software, digital platform, portal, MIS, data system, integration, implementation",
      "buyer_process: notice id, deadline, eligibility, terms of reference, bid/proposal submission",
    ],
    candidateNegativeSignals: [
      "portal_context_only: procurement portal/API docs without a notice item",
      "award_portfolio_only: impact report, award portfolio, annual report, success story",
      "consulting_marketing: grant writing or procurement consulting service page",
    ],
    evidenceTerms: ["procurement notice", "terms of reference", "software", "digital", "IT services", "deadline", "bid", "proposal"],
  },
  {
    key: "buyer_project_posts_negative_first",
    name: "Buyer project posts negative-first",
    mode: "negative_first",
    description:
      "Find buyer-authored project asks on forums, marketplaces, project boards and communities where someone asks for software delivery help.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "nl"],
    allowedContentKinds: ["editorial", "listing", "document"],
    positiveTexts: [
      "looking for developer agency web app project",
      "need software contractor integration project budget timeline",
      "seeking development team build SaaS MVP",
      "request help build custom software platform",
    ],
    negativeTexts: [
      ...COMMON_NEGATIVES,
      "freelancer profile, agency profile, seller portfolio, marketplace category page",
      "generic job ad for employee role with no contractor/vendor option",
    ],
    candidatePositiveSignals: [
      "buyer_ask: looking for, need, seeking, request, help with, project owner",
      "project_object: web app, mobile app, SaaS, API integration, automation, marketplace, platform",
      "commercial_fit: budget, timeline, fixed price, proposal, contractor, agency, team",
    ],
    candidateNegativeSignals: [
      "seller_profile: vendor/freelancer profile or agency listing",
      "navigation_wrapper: category, tag, search results, homepage",
      "advice_only: recommendation/tutorial without a current project ask",
    ],
    evidenceTerms: ["looking for", "need", "seeking", "project", "developer", "agency", "contractor", "budget", "timeline"],
  },
  {
    key: "startup_delivery_gap_negative_first",
    name: "Startup delivery gap negative-first",
    mode: "negative_first",
    description:
      "Find founder/CTO/product-owner posts showing roadmap pressure, MVP deadline, engineering capacity gap, or explicit external development partner need.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "nl"],
    allowedContentKinds: ["editorial", "listing", "document"],
    positiveTexts: [
      "startup need development team build MVP launch deadline",
      "founder looking for external developers product roadmap blocked",
      "fractional CTO software delivery partner request",
      "scaleup needs contractor team to build product features",
    ],
    negativeTexts: [
      ...COMMON_NEGATIVES,
      "internal hiring only, career page, recruiter post, job board without vendor ask",
      "outsourcing agency blog about hiring developers",
    ],
    candidatePositiveSignals: [
      "delivery_gap: MVP, launch deadline, roadmap blocked, backlog, capacity gap",
      "vendor_search: external developers, agency, dev shop, software partner, contractor team",
      "buyer_context: founder, CTO, product owner, startup, scaleup",
    ],
    candidateNegativeSignals: [
      "jobs_only: internal recruiting without vendor ask",
      "seller_authored: agency advert or lead magnet",
      "generic_advice: how to hire developers without a current buyer/project",
    ],
    evidenceTerms: ["startup", "MVP", "launch", "roadmap", "external developers", "agency", "contractor", "development team"],
  },
  {
    key: "migration_deadline_buyer_followthrough",
    name: "Migration deadline buyer follow-through",
    mode: "item_detail",
    description:
      "Find buyer/project/procurement follow-through from migrations, deprecations, compliance deadlines or integrations, not generic vendor/changelog context.",
    geographies: ["global"],
    languages: ["en", "ja", "ko", "de", "fr", "es", "pt", "pl"],
    allowedContentKinds: ["editorial", "listing", "document", "api_payload", "data_file"],
    positiveTexts: [
      "migration deadline RFP integration support vendor needed",
      "API deprecation buyer procurement implementation partner",
      "compliance deadline software integration project tender",
      "legacy modernization request for proposal vendor migration",
    ],
    negativeTexts: [
      ...COMMON_NEGATIVES,
      "generic changelog without buyer procurement or project follow-through",
      "vendor landing page about migration services",
    ],
    candidatePositiveSignals: [
      "deadline_pressure: deprecation, migration deadline, compliance date, breaking change",
      "implementation_need: integration, upgrade, migration, modernization, data conversion",
      "buyer_followthrough: RFP, procurement, project request, vendor support ask, implementation partner",
    ],
    candidateNegativeSignals: [
      "source_only_changelog: no buyer/project follow-through",
      "tutorial_only: how-to without current project or procurement",
      "seller_promo: agency landing page about migrations",
    ],
    evidenceTerms: ["migration", "deadline", "deprecation", "integration", "RFP", "vendor", "implementation", "modernization"],
  },
];

function parseArgs(argv) {
  return {
    skipBuild: !argv.includes("--build"),
    maxPacks: Number(argv.find((arg) => arg.startsWith("--max-packs="))?.split("=")[1] ?? RESCUE_PACKS.length),
    maxCandidates: Number(argv.find((arg) => arg.startsWith("--max-candidates="))?.split("=")[1] ?? 30),
    maxProbeRequests: Number(argv.find((arg) => arg.startsWith("--max-probes="))?.split("=")[1] ?? 8),
    selectedTarget: Number(argv.find((arg) => arg.startsWith("--selected-target="))?.split("=")[1] ?? 3),
  };
}

function envValue(env, key, fallback = "") {
  return String(process.env[key] ?? env[key] ?? fallback).trim();
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function valueFrom(record, keys) {
  for (const key of keys) {
    if (record?.[key] != null) return record[key];
  }
  return null;
}

function idFrom(record, keys) {
  const value = valueFrom(record, keys);
  return value == null ? null : String(value);
}

function canonicalUrl(candidate) {
  return String(valueFrom(candidate, ["canonical_url", "canonicalUrl", "url"]) ?? "");
}

function canonicalDomain(candidate) {
  const direct = String(valueFrom(candidate, ["canonical_domain", "canonicalDomain", "domain"]) ?? "");
  if (direct) return direct.toLowerCase();
  try {
    return new URL(canonicalUrl(candidate)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function artifactType(artifact) {
  return String(valueFrom(artifact, ["artifact_type", "artifactType"]) ?? "");
}

function artifactPayload(artifact) {
  return artifact?.payload_json ?? artifact?.payloadJson ?? artifact?.payload ?? null;
}

function textBlob(value) {
  return JSON.stringify(value ?? {}).toLowerCase();
}

function buyerEvidenceScore(pack, value) {
  const blob = textBlob(value);
  let score = 0;
  for (const term of pack.evidenceTerms ?? []) {
    if (blob.includes(term.toLowerCase())) score += 3;
  }
  for (const cue of ["rfp", "rfq", "tender", "solicitation", "proposal", "deadline", "budget", "looking for", "need", "seeking", "contractor", "vendor"]) {
    if (blob.includes(cue)) score += 2;
  }
  for (const noise of ["top software", "best agencies", "service page", "privacy policy", "case study", "portfolio", "impact report", "tutorial", "how to hire"]) {
    if (blob.includes(noise)) score -= 5;
  }
  return score;
}

function classifySelectedItem(pack, item, explain) {
  const blob = textBlob({ item, explain });
  if (/business directory|\/business\?|\/regions\/|\/about\/|\/help\b|contact|terms of use|external resources|status-tracker/iu.test(blob)) {
    return "noise";
  }
  const hasSoftwareScope =
    /software|app\b|application|web app|mobile app|saas|api\b|integration|data system|digital platform|portal|automation|modernization|implementation|it services|information system|mis\b/iu.test(
      blob
    );
  const hasBuyerProcess =
    /rfp|rfq|tender|solicitation|procurement|proposal|bid\b|deadline|budget|looking for|need|seeking|contractor|vendor|project owner|terms of reference/iu.test(
      blob
    );
  const score = buyerEvidenceScore(pack, { item, explain });
  if (!hasSoftwareScope || !hasBuyerProcess) return score <= 0 ? "noise" : "uncertain";
  if (score >= 8) return "useful";
  if (score <= 0) return "noise";
  return "uncertain";
}

function excludedGeoEvidence(candidate) {
  const blob = `${canonicalUrl(candidate)} ${canonicalDomain(candidate)} ${textBlob(candidate)}`.toLowerCase();
  return /\.ru\b|\.рф\b|\.cn\b|russia|russian federation|china|chinese government|beijing|shanghai/u.test(blob);
}

function buildInterestPayload(pack, namespace) {
  const hidden = pack.mode === "negative_first";
  return {
    name: `${pack.name} [${namespace}]`,
    description:
      `${pack.description} Rescue calibration for outsourcing buyer-signal funnel. ` +
      "Exclude Russia and China. Treat source usefulness separately from item-level buyer/project/vendor-search lead evidence.",
    positive_texts: pack.positiveTexts,
    negative_texts: pack.negativeTexts,
    must_have_terms: hidden ? "" : "",
    must_not_have_terms: pack.negativeTexts,
    places: pack.geographies,
    languages_allowed: pack.languages,
    time_window_hours: 24 * 365,
    allowed_content_kinds: pack.allowedContentKinds,
    short_tokens_required: "",
    short_tokens_forbidden: "",
    candidate_positive_signals: pack.candidatePositiveSignals,
    candidate_negative_signals: [
      ...pack.candidateNegativeSignals,
      "source_inventory_context: official source home/search page is useful only as source inventory, not final lead",
      "lead_requires_item_level_evidence: public selected content must show buyer/project/vendor-search demand",
    ],
    selection_profile_strictness: "balanced",
    selection_profile_unresolved_decision: "hold",
    selection_profile_llm_review_mode: hidden ? "optional_high_value_only" : "always",
    priority: hidden ? "0.78" : "0.86",
    isActive: true,
  };
}

function buildDiscoveryInterest(pack, interestId) {
  return {
    interestId,
    name: pack.name,
    description: pack.description,
    positive_texts: pack.positiveTexts,
    negative_texts: pack.negativeTexts,
    candidate_positive_signals: pack.candidatePositiveSignals,
    candidate_negative_signals: pack.candidateNegativeSignals,
    geographies: pack.geographies,
    languages: pack.languages,
    operatorConstraints: EXCLUDED_GEO_CONSTRAINTS,
  };
}

function extractChannelId(handoff) {
  const direct = idFrom(handoff?.sourceInventory, [
    "registered_channel_id",
    "registeredChannelId",
    "channel_id",
    "channelId",
  ]);
  if (direct) return direct;
  for (const row of handoff?.registrarResults ?? []) {
    const channelId = idFrom(row, ["channel_id", "channelId"]);
    if (channelId) return channelId;
  }
  return null;
}

function summarizeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error?.name ?? null,
    diagnostics: error?.mcpDiagnostics ?? error?.httpDiagnostics ?? null,
  };
}

function recordGap(report, category, message, context = {}) {
  const gap = { category, message, context, at: new Date().toISOString() };
  report.gaps.push(gap);
  log(`${category}: ${message}`);
  return gap;
}

async function mcp(report, client, token, name, args = {}, options = {}) {
  report.mcpCalls.push({ name, args, at: new Date().toISOString() });
  try {
    return await client.mcpToolCall(token, name, args, { timeoutMs: 120_000, ...options });
  } catch (error) {
    recordGap(report, options.gapCategory ?? "mcp_gap", `${name} failed`, { args, error: summarizeError(error) });
    if (options.optional) return null;
    throw error;
  }
}

async function safeMcp(report, client, token, name, args = {}, options = {}) {
  return mcp(report, client, token, name, args, { ...options, optional: true });
}

async function waitFor(label, fn, { timeoutMs = CONTENT_WAIT_MS, intervalMs = SHORT_WAIT_MS } = {}) {
  const started = Date.now();
  let lastValue = null;
  while (Date.now() - started < timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)?.slice(0, 600)}`);
}

async function preflight(client, token, report) {
  const [initialize, toolsList, resourcesList, promptsList] = await Promise.all([
    client.mcpRpc(token, "initialize", {}),
    client.mcpRpc(token, "tools/list", {}),
    client.mcpRpc(token, "resources/list", {}),
    client.mcpRpc(token, "prompts/list", {}),
  ]);
  report.mcpCalls.push(
    { name: "initialize", args: {}, at: new Date().toISOString() },
    { name: "tools/list", args: {}, at: new Date().toISOString() },
    { name: "resources/list", args: {}, at: new Date().toISOString() },
    { name: "prompts/list", args: {}, at: new Date().toISOString() }
  );
  const tools = new Set((toolsList?.result?.tools ?? []).map((tool) => String(tool.name)));
  const resources = new Set((resourcesList?.result?.resources ?? []).map((resource) => String(resource.uri)));
  const prompts = new Set((promptsList?.result?.prompts ?? []).map((prompt) => String(prompt.name)));
  const requiredTools = [
    "operator.selection.dashboard",
    "operator.funnel.audit",
    "operator.funnel.autoplan",
    "operator.funnel.iteration.recommend",
    "articles.residuals.summary",
    "articles.holds.summary",
    "content_items.list",
    "system_interests.create",
    "system_interests.read",
    "discovery.runs.execute",
    "discovery.candidates.list",
    "discovery.probe.plan_preview",
    "discovery.probe.execute",
    "discovery.understand.preview",
    "discovery.route.preview",
    "discovery.routing.apply",
    "discovery.feedback.submit",
    "maintenance.reindex.request",
    "operator.report.verify",
    "operator.effect.verify",
  ];
  const requiredResources = [
    "signalops://guide/scenarios/funnel-calibration",
    "signalops://guide/scenarios/discovery-live-gap-hunting",
    "signalops://articles/residuals-summary",
  ];
  const failures = [];
  if (String(initialize?.result?.serverInfo?.name ?? "") !== "signalops-mcp") failures.push("MCP initialize did not return signalops-mcp.");
  for (const tool of requiredTools) if (!tools.has(tool)) failures.push(`Missing MCP tool: ${tool}`);
  for (const resource of requiredResources) if (!resources.has(resource)) failures.push(`Missing MCP resource: ${resource}`);
  report.preflight = { tools: tools.size, resources: resources.size, prompts: prompts.size, failures };
  for (const uri of requiredResources) {
    await client.mcpResourceRead(token, uri);
    report.mcpCalls.push({ name: "resources/read", args: { uri }, at: new Date().toISOString() });
  }
  if (failures.length) throw new Error(`Preflight failed: ${failures.join("; ")}`);
}

async function readBaseline(client, token, report) {
  report.baseline.selectionDashboard = await mcp(report, client, token, "operator.selection.dashboard", {});
  report.baseline.funnelAudit = await mcp(report, client, token, "operator.funnel.audit", {
    objective: "Outsourcing buyer/project/vendor-search selected signal rescue",
    referenceEvidenceKind: "portable_funnel_guidance",
    referenceText:
      "Prior live MCP flow found sources but public selected buyer-signal count is zero after precision cleanup.",
    includeDiscovery: true,
    includeSamples: true,
  });
  report.baseline.autoplan = await mcp(report, client, token, "operator.funnel.autoplan", {
    objective: "Recover selected outsourcing buyer signals with balanced procurement plus hidden negative-first interests",
    rareSignal: true,
    maxNewChannels: 25,
    includeSamples: true,
  });
  report.baseline.iteration = await mcp(report, client, token, "operator.funnel.iteration.recommend", {
    objective: "Recover selected outsourcing buyer signals",
    includeSamples: true,
  });
  report.baseline.residuals = await mcp(report, client, token, "articles.residuals.summary", {});
  report.baseline.holds = await mcp(report, client, token, "articles.holds.summary", {});
  report.baseline.contentItems = await mcp(report, client, token, "content_items.list", { page: 1, pageSize: 10 });
}

async function createInterest(client, token, report, pack) {
  const namespace = `outsourcing-rescue-${report.runId.slice(0, 8)}`;
  const created = await mcp(report, client, token, "system_interests.create", {
    payload: buildInterestPayload(pack, namespace),
  });
  const interestId = idFrom(created, ["entityId", "interestTemplateId", "systemInterestId", "interestId"]);
  if (!interestId) throw new Error(`system_interests.create did not return an id for ${pack.key}.`);
  const readBack = await mcp(report, client, token, "system_interests.read", { interestTemplateId: interestId });
  report.readAfterWrite.push({ entity: "system_interest", id: interestId, tool: "system_interests.read", ok: Boolean(readBack) });
  return { interestId, readBack };
}

async function runDiscovery(client, token, report, pack, interestId, args) {
  const perPackBudget = Math.max(1, Math.floor(report.maxCostCents / Math.min(args.maxPacks, RESCUE_PACKS.length)));
  const result = await mcp(
    report,
    client,
    token,
    "discovery.runs.execute",
    {
      runKind: "full",
      triggerKind: "mcp",
      request: {
        interest: buildDiscoveryInterest(pack, interestId),
        maxBatches: 2,
        maxCandidates: args.maxCandidates,
        maxProbeRequests: args.maxProbeRequests,
        maxBrowserProbeRequests: 0,
        searchProvider: envValue(report.env, "DISCOVERY_SEARCH_PROVIDER", "ddgs"),
        timeRange: "m",
        budget: { maxRunCostCents: perPackBudget },
      },
      budget: {
        maxRunCostCents: perPackBudget,
        maxCandidates: args.maxCandidates,
        maxProbeRequests: args.maxProbeRequests,
        maxBrowserProbeRequests: 0,
      },
      liveProviderExecution: true,
      createdBy: `outsourcing-rescue:${report.runId}`,
    },
    { timeoutMs: DISCOVERY_WAIT_MS, gapCategory: "provider_gap" }
  );
  const runId = idFrom(result?.run, ["vnext_run_id", "vnextRunId", "runId"]);
  if (!runId) throw new Error(`discovery.runs.execute did not return a run id for ${pack.key}.`);
  const [runRead, steps, attempts, artifacts, candidates, inventory, backlog] = await Promise.all([
    safeMcp(report, client, token, "discovery.runs.read", { recordId: runId }),
    safeMcp(report, client, token, "discovery.run_steps.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.query_attempts.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.artifacts.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.candidates.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.source_inventory.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.adapter_backlog.list", { page: 1, pageSize: 100, interestId }),
  ]);
  const artifactRows = rows(artifacts).filter(
    (artifact) => idFrom(artifact, ["vnext_run_id", "vnextRunId"]) === runId || idFrom(artifact, ["interest_id", "interestId"]) === interestId
  );
  const candidateRows = rows(candidates).filter(
    (candidate) => idFrom(candidate, ["vnext_run_id", "vnextRunId"]) === runId || idFrom(candidate, ["interest_id", "interestId"]) === interestId
  );
  return {
    runId,
    runRead,
    steps: rows(steps),
    queryAttempts: rows(attempts),
    artifacts: artifactRows,
    artifactTypes: [...new Set(artifactRows.map(artifactType).filter(Boolean))].sort(),
    candidates: candidateRows,
    sourceInventory: rows(inventory),
    adapterBacklog: rows(backlog),
    brief: artifactPayload(artifactRows.find((artifact) => artifactType(artifact) === "DiscoveryBrief")),
  };
}

async function submitCandidateFeedback(client, token, report, packReport, candidate, feedbackType, reason, extra = {}) {
  const candidateId = idFrom(candidate, ["candidate_id", "candidateId"]);
  if (!candidateId) return null;
  const payload = {
    targetType: "candidate",
    targetId: candidateId,
    feedbackType,
    feedback: {
      reason,
      source: "codex-outsourcing-rescue",
      rescueRunId: report.runId,
      signalPack: packReport.key,
      ...extra,
      ...(feedbackType === "mark_useful"
        ? {
            usefulnessKind: "classification_usefulness",
            classificationCorrect: true,
            sourceUsefulAsClassified: true,
          }
        : {}),
    },
    createdBy: `outsourcing-rescue:${report.runId}`,
  };
  const result = await safeMcp(report, client, token, "discovery.feedback.submit", payload);
  if (result) report.feedback.push({ targetId: candidateId, feedbackType, reason, result });
  return result;
}

async function routeCandidate(client, token, report, pack, packReport, candidate) {
  const candidateUrl = canonicalUrl(candidate);
  if (!candidateUrl || !/^https?:\/\//iu.test(candidateUrl)) return null;
  const candidateId = idFrom(candidate, ["candidate_id", "candidateId"]);
  const candidateDomain = canonicalDomain(candidate);
  if (excludedGeoEvidence(candidate)) {
    await submitCandidateFeedback(client, token, report, packReport, candidate, "mark_noise", "Russia/China exclusion evidence.");
    return null;
  }
  const probePlan = await mcp(report, client, token, "discovery.probe.plan_preview", {
    candidateUrl,
    candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "website"),
    policy: { maxBrowserProbeRequests: 0, excludedGeoConstraints: EXCLUDED_GEO_CONSTRAINTS },
  });
  const probe = await mcp(
    report,
    client,
    token,
    "discovery.probe.execute",
    {
      probePlan: probePlan?.payload ?? probePlan,
      runId: packReport.runId,
      interestId: packReport.interestId,
      candidateId,
      createdBy: `outsourcing-rescue:${report.runId}`,
    },
    { timeoutMs: 180_000, gapCategory: "provider_gap" }
  );
  const probeReport = probe?.probeReportArtifact?.payload_json ?? probe?.probeReportArtifact?.payloadJson;
  if (!probeReport) return null;
  const understanding = await mcp(report, client, token, "discovery.understand.preview", {
    discoveryBrief: packReport.brief,
    probeReport,
    candidate: {
      candidateId,
      canonicalUrl: candidateUrl,
      canonicalDomain: candidateDomain,
      candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "website"),
    },
  });
  const sourceUnderstanding = understanding?.payload ?? understanding?.sourceUnderstanding?.payload ?? understanding?.sourceUnderstanding ?? understanding;
  const routePreview = await mcp(report, client, token, "discovery.route.preview", {
    sourceUnderstanding,
    providerType: String(sourceUnderstanding?.suggestedProviderType ?? "website"),
    accessPattern: String(sourceUnderstanding?.accessPattern ?? "public"),
    policy: { excludedGeoConstraints: EXCLUDED_GEO_CONSTRAINTS },
  });
  const routing = await mcp(report, client, token, "discovery.routing.apply", {
    sourceUnderstanding,
    canonicalUrl: candidateUrl,
    canonicalDomain: candidateDomain,
    sourceIdentityKey: `outsourcing-rescue:${report.runId}:${packReport.key}:${candidateUrl}`,
    providerType: String(sourceUnderstanding?.suggestedProviderType ?? "website"),
    accessPattern: String(sourceUnderstanding?.accessPattern ?? "public"),
    runId: packReport.runId,
    interestId: packReport.interestId,
    candidateId,
    createdBy: `outsourcing-rescue:${report.runId}`,
  });
  const routingDecision =
    routing?.routingDecisionArtifact?.payload_json ?? routing?.routingDecisionArtifact?.payloadJson ?? routing?.routingDecision ?? routePreview;
  const decision = String(routingDecision?.decision ?? "");
  const sourceInventoryId = idFrom(routing?.sourceInventory, ["source_inventory_id", "sourceInventoryId"]);
  const attempt = { candidateId, candidateUrl, candidateDomain, sourceInventoryId, decision };
  packReport.routingAttempts.push(attempt);
  const sourceUseful = /sam\.gov|ungm|worldbank|ebrd|ted\.europa|ec\.europa|procurement|tender|rfp|rfq|solicitation/iu.test(
    `${candidateUrl} ${textBlob(candidate)}`
  ) && !/biddetail\.com|tendernews\.com|allbusiness\.africa|top|best|agency|service|portfolio|case-study|business directory/iu.test(`${candidateUrl} ${textBlob(candidate)}`);
  await submitCandidateFeedback(
    client,
    token,
    report,
    packReport,
    candidate,
    sourceUseful ? "mark_useful" : "mark_noise",
    sourceUseful
      ? "Useful source or source-context candidate; item-level evidence is still required for public lead selection."
      : "Candidate lacks enough buyer/project/vendor-search evidence or looks like context/noise.",
    sourceUseful ? { expectedTreatment: "source_inventory_context_or_item_level_lead_only" } : { expectedTreatment: "noise_or_context_not_final_lead" }
  );
  if (decision !== "auto_register_probation") {
    return { candidateId, candidateUrl, sourceInventoryId, routingDecision, sourceUnderstanding, decision, channelId: null };
  }
  const handoff = await mcp(report, client, token, "discovery.probation.handoff", {
    sourceUnderstanding,
    routingDecision,
    sourceInventoryId,
    providerType: String(sourceUnderstanding?.suggestedProviderType ?? "website"),
    createdBy: `outsourcing-rescue:${report.runId}`,
  });
  const channelId = extractChannelId(handoff);
  attempt.channelId = channelId;
  attempt.handoffStatus = channelId ? "channel_created_or_read" : "missing_channel";
  if (channelId) {
    await mcp(report, client, token, "channels.read", { channelId });
    report.readAfterWrite.push({ entity: "source_channel", id: channelId, tool: "channels.read", ok: true });
  }
  return { candidateId, candidateUrl, sourceInventoryId, routingDecision, sourceUnderstanding, decision, channelId };
}

async function inspectContent(client, token, report, pack, packReport, channelId = null) {
  const listArgs = channelId ? { channelId, page: 1, pageSize: 20 } : { page: 1, pageSize: 20 };
  const [resourcesPage, articlesPage, contentPage] = await Promise.all([
    safeMcp(report, client, token, "web_resources.list", listArgs),
    safeMcp(report, client, token, "articles.list", listArgs),
    channelId ? safeMcp(report, client, token, "content_items.list", listArgs) : Promise.resolve(null),
  ]);
  packReport.webResources = rows(resourcesPage);
  packReport.articles = rows(articlesPage);
  if (channelId) packReport.contentItems = rows(contentPage);
  if (!channelId) return;
  for (const article of packReport.articles.slice(0, 5)) {
    const docId = idFrom(article, ["doc_id", "docId"]);
    if (!docId) continue;
    const explain = await safeMcp(report, client, token, "articles.explain", { docId });
    const classification = classifySelectedItem(pack, article, explain);
    packReport.explainedArticles.push({ docId, title: article.title ?? null, url: article.url ?? null, classification });
    if (classification === "useful") report.docIds.add(docId);
  }
  for (const item of packReport.contentItems.slice(0, 10)) {
    const contentItemId = idFrom(item, ["content_item_id", "contentItemId"]);
    if (!contentItemId) continue;
    const explain = await safeMcp(report, client, token, "content_items.explain", { contentItemId });
    const classification = classifySelectedItem(pack, item, explain);
    const selected = {
      contentItemId,
      title: item.title ?? null,
      url: item.url ?? null,
      packKey: pack.key,
      classification,
    };
    packReport.explainedContentItems.push(selected);
    if (classification === "useful") report.selectedSignals.push(selected);
  }
}

async function tryFetchRoutedChannels(client, token, report, pack, packReport) {
  const channelIds = [
    ...new Set(
      [
        ...packReport.sourceInventory.map((row) => idFrom(row, ["registered_channel_id", "registeredChannelId", "channel_id", "channelId"])),
        ...packReport.routingAttempts.map((row) => row.channelId ?? null),
      ]
        .filter(Boolean)
    ),
  ].slice(0, 2);
  for (const channelId of channelIds) {
    await safeMcp(report, client, token, "channels.read", { channelId });
    await safeMcp(report, client, token, "channels.sync.request", {
      channelId,
      reason: `outsourcing buyer-signal rescue ${report.runId}`,
    });
    await waitFor(
      `fetch_runs for ${channelId}`,
      async () => {
        const page = await safeMcp(report, client, token, "fetch_runs.list", { channelId, page: 1, pageSize: 20 });
        return rows(page).length > 0 ? page : null;
      },
      { timeoutMs: 90_000 }
    ).catch((error) => {
      packReport.fetchGaps.push({ channelId, message: error.message });
      return null;
    });
    await inspectContent(client, token, report, pack, packReport, channelId);
  }
}

async function runPack(client, token, report, pack, args) {
  const packReport = {
    key: pack.key,
    mode: pack.mode,
    status: "started",
    interestId: null,
    runId: null,
    readBack: null,
    steps: [],
    queryAttempts: [],
    artifacts: [],
    artifactTypes: [],
    candidates: [],
    sourceInventory: [],
    adapterBacklog: [],
    routingAttempts: [],
    fetchGaps: [],
    webResources: [],
    articles: [],
    contentItems: [],
    explainedArticles: [],
    explainedContentItems: [],
  };
  report.packs.push(packReport);
  const interest = await createInterest(client, token, report, pack);
  packReport.interestId = interest.interestId;
  packReport.readBack = interest.readBack;
  const discovery = await runDiscovery(client, token, report, pack, packReport.interestId, args);
  Object.assign(packReport, discovery);
  if (!packReport.candidates.length && !packReport.queryAttempts.length) {
    recordGap(report, "provider_gap", `${pack.key} produced no provider evidence.`);
    packReport.status = "no_provider_evidence";
    return packReport;
  }
  const preferred = packReport.candidates
    .filter((candidate) => /^https?:\/\//iu.test(canonicalUrl(candidate)))
    .filter((candidate) => !/google\.com|bing\.com|duckduckgo\.com|search\./iu.test(canonicalDomain(candidate)))
    .sort((left, right) => buyerEvidenceScore(pack, right) - buyerEvidenceScore(pack, left))
    .slice(0, 5);
  for (const candidate of preferred) {
    await routeCandidate(client, token, report, pack, packReport, candidate).catch((error) => {
      recordGap(report, "routing_gap", `${pack.key} candidate routing failed`, { candidateUrl: canonicalUrl(candidate), error: summarizeError(error) });
    });
  }
  await tryFetchRoutedChannels(client, token, report, pack, packReport);
  await inspectContent(client, token, report, pack, packReport);
  packReport.status =
    packReport.explainedContentItems.some((item) => item.classification === "useful")
      ? "selected_signal_found"
      : packReport.routingAttempts.length || packReport.adapterBacklog.length || packReport.sourceInventory.length
        ? "source_evidence_without_selected_signal"
        : "candidates_without_source_evidence";
  return packReport;
}

async function runReindexAndVerify(client, token, report) {
  const docIds = [...report.docIds].slice(0, 25);
  const reindexPayload = {
    payload: {
      indexName: "interest_centroids",
      jobKind: "backfill",
      options: {
        ...(docIds.length ? { docIds } : { replayExistingArticles: true, batchSize: 100 }),
        includeEnrichment: false,
        forceEnrichment: false,
        retroNotifications: "skip",
        reason: `outsourcing buyer-signal rescue ${report.runId}`,
      },
    },
  };
  report.reindex.request = await mcp(report, client, token, "maintenance.reindex.request", reindexPayload);
  const jobId = idFrom(report.reindex.request, ["reindexJobId", "jobId", "reindex_job_id"]);
  report.reindex.jobId = jobId;
  if (jobId) {
    const completed = await waitFor(
      `reindex job ${jobId}`,
      async () => {
        const page = await safeMcp(report, client, token, "maintenance.reindex_jobs.list", { page: 1, pageSize: 20 });
        const job = rows(page).find((row) => idFrom(row, ["reindex_job_id", "reindexJobId", "jobId"]) === jobId);
        if (job && /completed|failed|cancelled/iu.test(String(valueFrom(job, ["status", "job_status", "jobStatus"]) ?? ""))) return job;
        return null;
      },
      { timeoutMs: 4 * 60 * 1000 }
    ).catch((error) => ({ error: error.message }));
    report.reindex.completed = completed;
  }
  report.verification.selection = await safeMcp(report, client, token, "operator.report.verify", {
    reportKind: "selection",
    entityIds: {},
    includeSamples: true,
  });
  report.verification.holdQuality = await safeMcp(report, client, token, "operator.report.verify", {
    reportKind: "selection_hold_quality",
    entityIds: {},
    includeSamples: true,
  });
  report.verification.funnel = await safeMcp(report, client, token, "operator.report.verify", {
    reportKind: "funnel_calibration",
    entityIds: { targetIds: report.packs.map((pack) => pack.interestId).filter(Boolean) },
    includeSamples: true,
  });
  report.verification.website = await safeMcp(report, client, token, "operator.report.verify", {
    reportKind: "website_pipeline",
    entityIds: {},
    includeSamples: true,
  });
  report.verification.effect = await safeMcp(report, client, token, "operator.effect.verify", {
    domain: "selection",
    includeSamples: true,
  });
  report.afterReindex.dashboard = await safeMcp(report, client, token, "operator.selection.dashboard", {});
  report.afterReindex.contentItems = await safeMcp(report, client, token, "content_items.list", { page: 1, pageSize: 20 });
}

function selectedCount(report) {
  const contentRows = rows(report.afterReindex.contentItems).length ? rows(report.afterReindex.contentItems) : report.selectedSignals;
  return contentRows.length;
}

function summarize(report, args) {
  const sourceFamiliesWithEvidence = report.packs.filter(
    (pack) => pack.candidates.length || pack.queryAttempts.length || pack.sourceInventory.length || pack.adapterBacklog.length
  ).length;
  const routedOrBacklog = report.packs.filter((pack) => pack.routingAttempts.length || pack.adapterBacklog.length || pack.sourceInventory.length).length;
  const selected = selectedCount(report);
  report.successCriteria = {
    selectedSignals: selected,
    selectedTarget: args.selectedTarget,
    sourceFamiliesWithEvidence,
    routedOrBacklog,
    readAfterWrite: report.readAfterWrite.every((entry) => entry.ok) && report.readAfterWrite.length >= RESCUE_PACKS.length,
    mcpCalls: report.mcpCalls.length,
  };
  if (selected >= args.selectedTarget && sourceFamiliesWithEvidence >= 3 && routedOrBacklog >= 2) {
    report.status = "passed";
  } else {
    report.status = "needs_followup";
    report.failureClassification = {
      badHypothesisOrQueryDesign: report.packs.filter((pack) => pack.candidates.length === 0 && pack.queryAttempts.length > 0).map((pack) => pack.key),
      adapterOrAccessGap: report.packs.filter((pack) => pack.adapterBacklog.length > 0 || pack.fetchGaps.length > 0).map((pack) => pack.key),
      selectionPolicyTooStrict: selected === 0 && report.packs.some((pack) => pack.explainedArticles.some((item) => item.classification === "useful")),
      possibleSystemBug: false,
      note:
        "Do not relax public selected semantics. Continue MCP feedback/tuning/reindex loops unless evidence proves a system bug.",
    };
  }
}

function markdown(report) {
  const lines = [
    `# Outsourcing Buyer-Signal MCP Rescue ${report.runId}`,
    "",
    `- status: ${report.status}`,
    `- startedAt: ${report.startedAt}`,
    `- finishedAt: ${report.finishedAt}`,
    `- JSON: ${report.artifacts.jsonPath}`,
    `- MCP calls: ${report.mcpCalls.length}`,
    `- selectedSignals: ${report.successCriteria.selectedSignals}/${report.successCriteria.selectedTarget}`,
    `- sourceFamiliesWithEvidence: ${report.successCriteria.sourceFamiliesWithEvidence}`,
    `- routedOrBacklog: ${report.successCriteria.routedOrBacklog}`,
    "",
    "## Packs",
    "",
  ];
  for (const pack of report.packs) {
    lines.push(
      `### ${pack.key}`,
      "",
      `- status: ${pack.status}`,
      `- interestId: ${pack.interestId}`,
      `- discoveryRunId: ${pack.runId}`,
      `- queryAttempts: ${pack.queryAttempts.length}`,
      `- candidates: ${pack.candidates.length}`,
      `- sourceInventory: ${pack.sourceInventory.length}`,
      `- adapterBacklog: ${pack.adapterBacklog.length}`,
      `- routingAttempts: ${pack.routingAttempts.length}`,
      `- contentItems: ${pack.contentItems.length}`,
      `- usefulSelectedSamples: ${pack.explainedContentItems.filter((item) => item.classification === "useful").length}`,
      ""
    );
    for (const item of pack.explainedContentItems.filter((entry) => entry.classification === "useful").slice(0, 5)) {
      lines.push(`- selected ${item.contentItemId}: ${item.title ?? "(untitled)"} — ${item.url ?? ""}`);
    }
    if (pack.explainedContentItems.some((entry) => entry.classification === "useful")) lines.push("");
  }
  lines.push("## Failure Classification", "", JSON.stringify(report.failureClassification ?? {}, null, 2), "");
  lines.push("## Reindex", "", JSON.stringify(report.reindex, null, 2), "");
  lines.push("## Gaps", "");
  for (const gap of report.gaps) lines.push(`- ${gap.category}: ${gap.message}`);
  lines.push("", "## MCP Calls", "");
  for (const call of report.mcpCalls) lines.push(`- ${call.name}`);
  lines.push("");
  return lines.join("\n");
}

async function persist(report) {
  report.finishedAt = new Date().toISOString();
  const jsonPath = `/tmp/signalops-outsourcing-buyer-signal-rescue-${report.runId}.json`;
  const mdPath = `/tmp/signalops-outsourcing-buyer-signal-rescue-${report.runId}.md`;
  report.artifacts = { jsonPath, mdPath };
  const serializable = {
    ...report,
    docIds: [...report.docIds],
  };
  await writeFile(jsonPath, `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
  await writeFile(mdPath, markdown(serializable), "utf8");
  log(`wrote ${jsonPath}`);
  log(`wrote ${mdPath}`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const env = await readEnvFile(".env.dev");
  const client = createHarness({ logPrefix: "outsourcing-rescue" });
  const report = {
    kind: "outsourcing-buyer-signal-rescue",
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    env: {
      DISCOVERY_ENABLED: envValue(env, "DISCOVERY_ENABLED"),
      DISCOVERY_SEARCH_PROVIDER: envValue(env, "DISCOVERY_SEARCH_PROVIDER", "ddgs"),
      DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS: envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS"),
    },
    maxCostCents: Number(envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS", "0")),
    args,
    preflight: {},
    baseline: {},
    afterReindex: {},
    packs: [],
    feedback: [],
    readAfterWrite: [],
    reindex: {},
    verification: {},
    gaps: [],
    mcpCalls: [],
    selectedSignals: [],
    successCriteria: {},
    failureClassification: null,
    artifacts: {},
    docIds: new Set(),
  };
  try {
    await client.setup({ rebuild: !args.skipBuild });
    const issued = await client.issueToken({
      label: `outsourcing-rescue-${report.runId}`,
      scopes: "read,write.discovery,write.channels,write.sequences,write.templates",
    });
    await preflight(client, issued.token, report);
    await readBaseline(client, issued.token, report);
    for (const pack of RESCUE_PACKS.slice(0, args.maxPacks)) {
      await runPack(client, issued.token, report, pack, args).catch((error) => {
        recordGap(report, "pack_gap", `${pack.key} failed`, summarizeError(error));
      });
    }
    await runReindexAndVerify(client, issued.token, report);
    summarize(report, args);
    await persist(report);
    if (report.status !== "passed") {
      throw new Error(`Outsourcing buyer-signal rescue needs follow-up. See ${report.artifacts.jsonPath}`);
    }
  } finally {
    await client.cleanup();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
