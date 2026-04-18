function signalGroup(name, cues) {
  return {
    name,
    cues,
  };
}

function profilePolicy(strictness) {
  return {
    strictness,
    unresolved_decision: "hold",
    llm_review_mode: "always",
    final_selection_mode: "compatibility_system_selected",
  };
}

const LLM_TEMPLATES = Object.freeze([
  {
    template_name: "Outsourcing buyer-intent interest review",
    scope: "interests",
    prompt_template: `You review whether an article matches the stated outsourcing-related system interest.

Interest name: {interest_name}
Interest description: {interest_description}

Article title: {title}
Article lead: {lead}
Article body: {body}
Extra context: {explain_json}

Respond with JSON:
{
  "decision": "approve" or "reject" or "uncertain",
  "score": 0.0 to 1.0,
  "reason": "brief explanation"
}

Approve when the article clearly reflects buyer-side outsourcing demand, such as:
- buyer-authored marketplace project cards for software build, integration, migration, rescue, support, or dedicated-team work
- formal software procurement, vendor selection, bids, proposals, RFP/RFQ/tender, or implementation contracting
- an organization explicitly looking for an external delivery team, agency, contractor, partner, or vendor to execute software work

Use "uncertain" when the item looks like a real buyer-side software request but the text is brief, truncated, or only partially confirms the sourcing pattern.

Reject when the page is mainly:
- a procurement portal shell, index, news page, FAQ, help page, or generic opportunities page
- a category page, browse page, marketplace search page, directory, or talent network
- a freelancer profile, agency page, vendor landing page, seller listing, case study, ranking, or award article
- an internal hiring post, recruiter listing, employment ad, or career page
- generic commentary or news with no active sourcing need

Important:
- do not require the exact words "outsourcing" or "agency" if buyer-side software sourcing is otherwise explicit
- prefer concrete delivery evidence such as budget, bids, proposals, deliverables, scope, timelines, existing codebase takeover, or backlog pressure
- generic "opportunities" homepages or procurement navigation pages are out of scope even if they are vendor-facing
- reject seller-authored surfaces even if they mention similar software terms`,
  },
  {
    template_name: "Outsourcing buyer-intent criterion review",
    scope: "criteria",
    prompt_template: `You are a strict reviewer for one outsourcing-related system criterion.

The criterion is authoritative: "{criterion_name}".

Decide whether the article materially matches this criterion because it shows a real buyer-side need for outside software delivery, implementation, migration, takeover, procurement, or staff augmentation.

Article title: {title}
Article lead: {lead}
Article body: {body}
Extra context: {explain_json}

Respond with JSON:
{
  "decision": "approve" or "reject" or "uncertain",
  "score": 0.0 to 1.0,
  "reason": "brief explanation"
}

Approve when the article clearly shows one or more of these:
- a founder, manager, product owner, procurement team, or company is actively sourcing an external team, agency, vendor, implementation partner, contractor, rescue/takeover team, or staff-augmentation partner
- a buyer-authored marketplace project card or tender notice describes a concrete software build, integration, migration, replacement, support takeover, or dedicated-team request
- the text includes scoped delivery evidence such as budget, bids, proposals, quote request, deliverables, timeline, or statement of work
- a real organization is running software procurement, vendor selection, RFQ/RFP/tender, or implementation contracting

Use "uncertain" when the article looks buyer-side and delivery-scoped but the authorship or outsourcing intent is still truncated or implicit.

Reject when the article is mainly about:
- portal shells, procurement indexes, opportunities homepages, help pages, FAQs, news pages, or advisory pages
- category pages, search pages, browse pages, directories, talent networks, or generic marketplace indexes
- agency, vendor, consultant, or freelancer self-promotion
- case studies, awards, rankings, portfolios, or service landing pages
- internal hiring, recruiter content, employment vacancies, career pages, or role descriptions for the buyer's own team
- generic startup, AI, product, modernization, or transformation content with no active sourcing signal

Important:
- buyer-authored marketplace project cards can be valid even if they do not use the exact word "outsourcing"
- phrases like "contract opportunities", "search opportunities", "find opportunities", or vendor-facing government-contracting navigation are not buyer requests and should be rejected unless the page itself is a concrete software solicitation
- a single contractor/project post can still qualify if it clearly externalizes software delivery to a third party
- words like partner, migration, MVP, modernization, or transformation are not enough on their own
- seller-authored marketplace listings, freelancer profiles, and "available for hire" pages should be rejected
- if evidence is weak and not plausibly buyer-side, return "reject"`,
  },
  {
    template_name: "Outsourcing buyer-intent global review",
    scope: "global",
    prompt_template: `You are the final global reviewer for outsourcing-related buyer-intent.

Decide whether the article belongs in the system-selected collection because it represents a real buyer-side need for external software delivery, implementation, procurement, migration, support takeover, or dedicated-team capacity.

Article title: {title}
Article lead: {lead}
Article body: {body}
Extra context: {explain_json}

Respond with JSON:
{
  "decision": "approve" or "reject" or "uncertain",
  "score": 0.0 to 1.0,
  "reason": "brief explanation"
}

Approve when the article clearly shows one or more of these:
- a founder, product owner, manager, procurement team, or organization is actively sourcing an outside software team or vendor
- a buyer-authored marketplace project card requests software build, implementation, integration, migration, rescue, support, or contract engineering work
- a formal procurement or vendor-selection flow exists for software delivery or managed application services
- the text contains concrete outsourcing evidence such as proposals, bids, quotes, budget, timeline, deliverables, statement of work, or replacing a current vendor

Use "uncertain" when buyer-side intent is plausible but the article is truncated or still missing explicit delivery context.

Reject when the article is mainly about:
- a portal shell, index, browse page, search page, help page, FAQ, or procurement news wrapper
- a category page, directory, talent network, or generic marketplace/jobs listing page
- a seller-authored freelancer profile, agency page, service pitch, case study, ranking, or award article
- internal hiring, recruiter content, employment vacancies, or career pages
- general commentary, news, or analysis without an active sourcing event

Important:
- real buyer-side marketplace project cards are in scope even when the wording is short
- exact keyword matching is not required if the sourcing pattern is concrete
- generic government-contracting or opportunities landing pages should be rejected unless the page itself is a concrete software procurement notice
- do not approve pages whose main function is navigation, aggregation, self-promotion, or recruiting`,
  },
]);

const INTEREST_TEMPLATES = Object.freeze([
  {
    name: "Buyer requests for outsourced product build",
    description:
      "Signals that a buyer-side founder, product owner, manager, or company is actively sourcing an outside team, agency, vendor, or marketplace project delivery partner to build, ship, extend, or take over a software product, app, portal, platform, or integration.",
    positive_prototypes: [
      "Founder posts a fixed-price project for an external team to build a SaaS MVP.",
      "Company requests bids or proposals for a mobile app, web portal, or software platform build.",
      "Marketplace project card shows a buyer looking for developers to deliver an app, dashboard, or API integration.",
      "Product owner seeks outside team to take over an existing codebase and ship the next release.",
      "Business requests an agency or freelance delivery team for a scoped software implementation with budget and timeline.",
      "Company needs an external vendor to build customer portal, marketplace platform, or internal workflow system.",
      "Buyer asks for a software house or contractor team to deliver a web application from design to release.",
      "Organization seeks external developers for MVP, rebuild, redesign, or platform delivery without in-house hiring.",
    ],
    negative_prototypes: [
      "Agency landing page offering MVP development services.",
      "Freelancer profile advertising app development availability.",
      "Category page listing freelance software jobs or projects.",
      "Marketplace search page for finding freelancers or agencies.",
      "Ranking of top software development agencies.",
      "Case study about a past product build for another client.",
      "Job-board listing recruiting an in-house engineer or product developer.",
      "Generic startup article about MVPs or software trends with no active sourcing request.",
    ],
    must_have_terms: [],
    must_not_have_terms: [
      "available for hire",
      "remote jobs",
      "freelance jobs",
      "top freelancers",
      "case study",
      "our services",
      "agency profile",
      "contract opportunities",
      "search opportunities",
    ],
    selection_profile_policy: profilePolicy("broad"),
    candidate_positive_signals: [
      signalGroup("buyer_request", [
        "looking for developers",
        "looking for development team",
        "looking for agency",
        "looking for software house",
        "need help",
        "need a developer",
        "need a team",
        "want to hire",
        "seeking developer",
        "seeking team",
      ]),
      signalGroup("scoped_project", [
        "fixed price",
        "budget",
        "timeline",
        "deliverables",
        "proposals",
        "bids",
        "quote",
      ]),
      signalGroup("software_build", [
        "mobile app",
        "web app",
        "saas",
        "mvp",
        "portal",
        "platform",
        "dashboard",
        "api integration",
      ]),
      signalGroup("external_delivery", [
        "agency",
        "software house",
        "external team",
        "development partner",
        "delivery partner",
        "contractor",
        "freelance team",
      ]),
      signalGroup("takeover_extension", [
        "take over",
        "continue development",
        "existing codebase",
        "maintain and enhance",
        "support and development",
      ]),
    ],
    candidate_negative_signals: [
      signalGroup("category_noise", [
        "freelance jobs",
        "remote jobs",
        "browse jobs",
        "technology & programming projects",
        "jobs online",
      ]),
      signalGroup("directory_noise", [
        "talent network",
        "top freelancers",
        "available freelancers",
        "search opportunities",
        "contract opportunities",
      ]),
      signalGroup("seller_noise", [
        "available for hire",
        "our services",
        "case study",
        "portfolio",
        "agency profile",
      ]),
      signalGroup("hiring_noise", [
        "full-time",
        "career page",
        "join our team",
        "recruiter",
        "employment",
      ]),
    ],
    allowed_content_kinds: ["editorial", "listing"],
    time_window_hours: null,
    priority: 1,
  },
  {
    name: "Staff augmentation and dedicated team demand",
    description:
      "Signals that a buyer-side organization is actively sourcing outside engineering capacity such as staff augmentation, dedicated delivery team, external squad, or contract developers to accelerate a software backlog, rollout, or roadmap.",
    positive_prototypes: [
      "Engineering manager seeks staff augmentation partner for backend, frontend, QA, or DevOps delivery.",
      "Company needs external developers or dedicated team to hit delivery deadline.",
      "Buyer requests nearshore or offshore squad to accelerate product roadmap.",
      "Organization looks for contract developers to support an active software backlog or implementation.",
      "Product team wants outside engineering capacity instead of full-time hiring.",
      "Marketplace project or sourcing post asks for dedicated team, external squad, or ongoing contractor support.",
      "Company needs external QA and engineering support for release delivery and ongoing sprint work.",
      "Business requests vendor-managed engineering capacity across multiple software roles.",
    ],
    negative_prototypes: [
      "Company opens in-house hiring for engineers or recruiters.",
      "Career page listing permanent engineering roles.",
      "Staff augmentation firm advertises available bench or dedicated team services.",
      "Marketplace category page of remote jobs or freelance jobs.",
      "Recruiter post for one employer contract vacancy.",
      "Vendor landing page promoting outsourcing packages.",
      "Blog article comparing staff augmentation versus outsourcing.",
      "Directory page for finding freelancers or contractors.",
    ],
    must_have_terms: [],
    must_not_have_terms: [
      "job opening",
      "career page",
      "available bench",
      "our dedicated team services",
      "remote jobs",
      "freelance jobs",
      "case study",
      "contract opportunities",
    ],
    selection_profile_policy: profilePolicy("broad"),
    candidate_positive_signals: [
      signalGroup("capacity_gap", [
        "backlog",
        "delivery deadline",
        "accelerate roadmap",
        "extra capacity",
        "sprint support",
        "ongoing support",
      ]),
      signalGroup("team_request", [
        "dedicated team",
        "staff augmentation",
        "external squad",
        "contract developers",
        "nearshore team",
        "offshore team",
      ]),
      signalGroup("software_roles", [
        "backend",
        "frontend",
        "qa",
        "devops",
        "mobile",
        "full stack",
      ]),
      signalGroup("commercial_terms", [
        "hourly",
        "monthly rate",
        "3 months",
        "6 months",
        "ongoing opportunities",
      ]),
    ],
    candidate_negative_signals: [
      signalGroup("hiring_noise", [
        "full-time",
        "career page",
        "join our team",
        "recruiter",
        "employment",
      ]),
      signalGroup("seller_noise", [
        "available bench",
        "our dedicated team services",
        "available for hire",
        "vendor landing page",
        "case study",
      ]),
      signalGroup("category_noise", [
        "remote jobs",
        "freelance jobs",
        "browse jobs",
        "jobs online",
        "contract opportunities",
      ]),
      signalGroup("marketplace_directory", [
        "talent network",
        "recruiter",
        "top freelancers",
      ]),
    ],
    allowed_content_kinds: ["editorial", "listing"],
    time_window_hours: null,
    priority: 0.95,
  },
  {
    name: "Software procurement and vendor selection",
    description:
      "Signals that a buyer-side organization is running real software procurement, RFP/RFQ/tender, vendor selection, or implementation contracting for software delivery, integration, modernization, migration, or managed application services, while excluding portal shells and procurement news/help wrappers.",
    positive_prototypes: [
      "City issues RFP for software delivery, application modernization, or implementation vendor.",
      "Enterprise launches vendor selection for ERP, CRM, or software rollout partner.",
      "Bank publishes RFQ for data migration, integration, or development contractor.",
      "Government tender seeks software supplier for application build, modernization, or managed services.",
      "University requests proposals for external app development or platform implementation vendor.",
      "Company shortlists vendors for CRM rollout, migration, or systems integration work.",
      "Healthcare group invites bids for managed application services or support takeover.",
      "Buyer prepares implementation contract or statement of work for outside software partner.",
    ],
    negative_prototypes: [
      "Procurement portal index or generic opportunities landing page.",
      "Procurement news, awards, or market-report article.",
      "Help center, FAQ, advisory page, or guide about how to write an RFP.",
      "Vendor marketing page for procurement automation software.",
      "Ranking of top systems integrators or award winners.",
      "Career-page or hiring announcement unrelated to vendor sourcing.",
      "Marketplace category page or directory of contractors.",
      "Portal shell where no concrete software delivery notice or buyer request is visible.",
    ],
    must_have_terms: [],
    must_not_have_terms: [
      "how to write an rfp",
      "procurement automation",
      "award winner",
      "ranking of",
      "help center",
      "faq",
      "latest news",
      "contract opportunities",
      "career page",
      "vendor marketing",
    ],
    selection_profile_policy: profilePolicy("balanced"),
    candidate_positive_signals: [
      signalGroup("formal_procurement", [
        "rfp",
        "rfq",
        "request for proposal",
        "request for quotation",
        "tender",
        "invites bids",
      ]),
      signalGroup("vendor_process", [
        "vendor selection",
        "supplier shortlist",
        "requests proposals",
        "implementation contract",
        "statement of work",
        "outside software partner",
      ]),
      signalGroup("software_scope", [
        "software development",
        "application modernization",
        "app development",
        "implementation services",
        "managed application services",
        "system integration",
      ]),
      signalGroup("delivery_need", [
        "migration",
        "rollout",
        "replacement",
        "support takeover",
        "modernization",
      ]),
    ],
    candidate_negative_signals: [
      signalGroup("portal_shell", [
        "contract opportunities",
        "search opportunities",
        "browse notices",
        "latest news",
        "sign in to view",
      ]),
      signalGroup("advisory_noise", [
        "how to write an rfp",
        "procurement guide",
        "help center",
        "faq",
        "market report",
      ]),
      signalGroup("seller_noise", [
        "award winner",
        "ranking",
        "vendor marketing",
        "case study",
        "procurement automation",
      ]),
      signalGroup("directory_noise", [
        "find freelancers",
        "hire freelancers",
        "remote jobs",
        "freelance jobs",
        "directory",
      ]),
    ],
    allowed_content_kinds: ["editorial", "listing", "document", "data_file", "api_payload"],
    time_window_hours: null,
    priority: 1,
  },
  {
    name: "Implementation partner search for migration or replacement",
    description:
      "Signals that a buyer-side organization is actively sourcing an outside implementation partner, migration vendor, systems integrator, or replacement delivery team for a software rollout, replatforming, system replacement, data migration, or integration program.",
    positive_prototypes: [
      "Company seeks implementation partner for ERP, CRM, or platform migration.",
      "Organization requests proposals from outside vendors for software replacement or replatforming delivery.",
      "Buyer searches for systems integrator to execute rollout, cutover, or data migration project.",
      "Marketplace or procurement post shows a company sourcing an external team for migration, integration, or replacement work.",
      "Enterprise needs outside specialists to move from legacy platform to a new software stack.",
      "Business invites vendors to quote on implementation, integration, or migration services under deadline.",
      "Company looks for contractor team to replace current vendor on a transformation or rollout program.",
      "Organization wants external delivery help for system integration, modernization, or platform switch.",
    ],
    negative_prototypes: [
      "Vendor blog about cloud migration best practices.",
      "Thought-leadership article on digital transformation strategy.",
      "Internal modernization roadmap with no partner search.",
      "Category page of migration jobs, implementation jobs, or contractor listings.",
      "Marketplace search page for consultants or freelancers.",
      "Press release about a tooling launch or strategic partnership.",
      "Career-page opening for implementation manager or migration engineer.",
      "General portal shell or procurement news page with no concrete software delivery request.",
    ],
    must_have_terms: [],
    must_not_have_terms: [
      "best practices",
      "thought leadership",
      "modernization roadmap",
      "career page",
      "remote jobs",
      "freelance jobs",
      "tooling launch",
      "vendor blog",
      "contract opportunities",
      "search opportunities",
    ],
    selection_profile_policy: profilePolicy("broad"),
    candidate_positive_signals: [
      signalGroup("migration_need", [
        "migration",
        "replatform",
        "replacement",
        "move from",
        "switch platform",
        "modernization",
      ]),
      signalGroup("implementation_scope", [
        "erp",
        "crm",
        "data migration",
        "system integration",
        "api integration",
        "cutover",
        "rollout",
      ]),
      signalGroup("sourcing_request", [
        "implementation partner",
        "looking for partner",
        "external team",
        "systems integrator",
        "migration partner",
        "quote",
        "proposals",
        "bids",
      ]),
      signalGroup("program_pressure", [
        "deadline",
        "legacy system",
        "current vendor",
        "outside specialists",
        "take over",
      ]),
    ],
    candidate_negative_signals: [
      signalGroup("advisory_noise", [
        "best practices",
        "thought leadership",
        "roadmap",
        "playbook",
        "guide",
      ]),
      signalGroup("category_noise", [
        "remote jobs",
        "freelance jobs",
        "browse jobs",
        "jobs online",
        "talent network",
        "contract opportunities",
      ]),
      signalGroup("seller_noise", [
        "our services",
        "available for hire",
        "consulting pitch",
        "vendor blog",
        "case study",
      ]),
      signalGroup("portal_shell", [
        "latest news",
        "help center",
        "faq",
        "search opportunities",
        "contract opportunities",
      ]),
    ],
    allowed_content_kinds: ["editorial", "listing", "document"],
    time_window_hours: null,
    priority: 0.9,
  },
  {
    name: "Legacy system rescue and support takeover",
    description:
      "Signals that a buyer-side organization needs an outside vendor, contractor team, or support partner to rescue, stabilize, maintain, continue, or take over an inherited software product, legacy system, abandoned implementation, or existing codebase.",
    positive_prototypes: [
      "Company needs new vendor to take over an abandoned software project.",
      "Business seeks support partner for inherited legacy platform and existing codebase.",
      "Organization replaces previous contractor and needs rescue or stabilization team.",
      "Buyer requests outside team to continue development after earlier vendor failure.",
      "Company needs maintenance vendor for critical application support plus improvements.",
      "Marketplace project card asks for help taking over, fixing, or modernizing an existing system.",
      "Enterprise wants code audit, stabilization, and handover support from an external team.",
      "Product owner seeks outside rescue team for delayed implementation or broken platform.",
    ],
    negative_prototypes: [
      "Agency promotes legacy modernization services on a landing page.",
      "Vendor blog about support services or technical debt trends.",
      "Internal incident report or engineering retrospective.",
      "Career-page opening for support engineer or maintenance developer.",
      "Community discussion about bad outsourcing experiences.",
      "Case study about rescuing a client codebase in the past.",
      "Category page of support jobs, maintenance jobs, or freelance services.",
      "General article about technical debt or modernization with no active vendor search.",
    ],
    must_have_terms: [],
    must_not_have_terms: [
      "our support services",
      "vendor blog",
      "technical debt article",
      "community discussion",
      "postmortem",
      "career page",
      "remote jobs",
      "freelance jobs",
      "case study",
      "available for hire",
      "contract opportunities",
    ],
    selection_profile_policy: profilePolicy("balanced"),
    candidate_positive_signals: [
      signalGroup("takeover_need", [
        "take over",
        "takeover",
        "replace current vendor",
        "continue development",
        "handover",
        "previous developer",
      ]),
      signalGroup("rescue_work", [
        "rescue",
        "stabilize",
        "bug fixing",
        "support existing",
        "maintain existing",
        "code audit",
      ]),
      signalGroup("legacy_context", [
        "legacy system",
        "existing codebase",
        "abandoned project",
        "delayed implementation",
        "inherited platform",
      ]),
      signalGroup("external_support", [
        "outside team",
        "support partner",
        "maintenance vendor",
        "contractor",
        "managed support",
      ]),
    ],
    candidate_negative_signals: [
      signalGroup("seller_noise", [
        "our support services",
        "agency advertises",
        "consulting pitch",
        "vendor blog",
        "available for hire",
      ]),
      signalGroup("internal_noise", [
        "incident report",
        "postmortem",
        "hiring support engineer",
        "career page",
        "technical debt article",
      ]),
      signalGroup("category_noise", [
        "remote jobs",
        "freelance jobs",
        "browse jobs",
        "services",
        "contract opportunities",
      ]),
      signalGroup("community_noise", [
        "community discussion",
        "forum thread",
        "reddit",
        "thought leadership",
        "case study",
      ]),
    ],
    allowed_content_kinds: ["editorial", "listing"],
    time_window_hours: null,
    priority: 0.85,
  },
]);

const OUTSOURCE_EXAMPLE_C_BUNDLE = Object.freeze({
  llm_templates: LLM_TEMPLATES,
  interest_templates: INTEREST_TEMPLATES,
});

const OUTSOURCE_EXAMPLE_C_PARITY = Object.freeze({
  llmTemplateKeys: LLM_TEMPLATES.map((template) => `${template.scope}::${template.template_name}`),
  interestTemplateNames: INTEREST_TEMPLATES.map((template) => template.name),
});

export {
  INTEREST_TEMPLATES as OUTSOURCE_EXAMPLE_C_INTEREST_TEMPLATES,
  LLM_TEMPLATES as OUTSOURCE_EXAMPLE_C_LLM_TEMPLATES,
  OUTSOURCE_EXAMPLE_C_BUNDLE,
  OUTSOURCE_EXAMPLE_C_PARITY,
};
