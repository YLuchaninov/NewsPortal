import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

import { OUTSOURCE_EXAMPLE_C_BUNDLE } from "./lib/outsource-example-c.bundle.mjs";

const CRITERION_COMPILE_REQUESTED_EVENT = "criterion.compile.requested";
const REINDEX_REQUESTED_EVENT = "reindex.requested";

const JOB_BOARD_SELECTION_POLICY = {
  strictness: "balanced",
  unresolved_decision: "hold",
  llm_review_mode: "always",
};

const JOB_BOARD_NEGATIVE_SIGNALS = [
  { name: "career_advice_noise", cues: ["interview tips", "resume guide", "career advice", "how to get hired"] },
  { name: "market_report_noise", cues: ["salary survey", "labor statistics", "market analysis", "hiring trends"] },
  { name: "non_opening_noise", cues: ["layoffs", "restructuring", "earnings report", "product launch"] },
];

const EXAMPLE_A_INTEREST_TEMPLATES = [
  {
    name: "Backend Engineering Jobs",
    description:
      "Job openings for backend developers: Python, Java, Go, Node.js, APIs, databases, microservices.",
    positive_prototypes: [
      "Senior Python backend developer needed at fintech startup in Berlin.",
      "Hiring Go engineer for distributed systems team — fully remote.",
      "Staff backend engineer role at e-commerce scale-up — PostgreSQL and Redis expertise.",
      "Mid-level Python Django developer wanted for Series B startup — remote OK.",
      "Backend software engineer opening at cloud infrastructure company — Rust or Go preferred.",
    ],
    negative_prototypes: [
      "How to prepare for a backend engineering interview in 2026.",
      "Python 3.15 release introduces new performance optimizations.",
      "Tech industry salary survey reveals backend engineers earn 15% more than average.",
    ],
    must_have_terms: [],
    must_not_have_terms: ["interview guide", "salary survey", "quarterly revenue", "migration case study"],
    allowed_content_kinds: ["listing", "editorial"],
    time_window_hours: null,
    priority: 1,
    selection_profile_policy: JOB_BOARD_SELECTION_POLICY,
    candidate_positive_signals: [
      { name: "hiring_signal", cues: ["hiring", "we are hiring", "position", "opening"] },
      { name: "role_core", cues: ["backend engineer", "backend developer", "python", "java", "go", "node.js"] },
    ],
    candidate_negative_signals: JOB_BOARD_NEGATIVE_SIGNALS,
  },
  {
    name: "Frontend & React Jobs",
    description:
      "Job openings for frontend developers: React, Vue, Angular, TypeScript, UI/UX engineering.",
    positive_prototypes: [
      "Senior React developer needed for B2B SaaS dashboard — remote position.",
      "Hiring frontend engineer with TypeScript and Next.js experience.",
      "We are looking for a staff frontend engineer to lead our design system team.",
      "Mid-level React Native developer opening at mobile-first fintech startup.",
      "UI engineer wanted for accessibility-focused product team — remote US only.",
    ],
    negative_prototypes: [
      "React 20 released with new concurrent rendering features.",
      "Best VS Code extensions for frontend developers in 2026.",
      "Frontend development trends to watch this year.",
    ],
    must_have_terms: [],
    must_not_have_terms: ["frontend trends", "vs code extensions", "browser features", "rendering comparison"],
    allowed_content_kinds: ["listing", "editorial"],
    time_window_hours: null,
    priority: 0.98,
    selection_profile_policy: JOB_BOARD_SELECTION_POLICY,
    candidate_positive_signals: [
      { name: "hiring_signal", cues: ["hiring", "we are looking for", "opening", "position"] },
      { name: "role_core", cues: ["react", "vue", "angular", "typescript", "ui engineer", "frontend architect"] },
    ],
    candidate_negative_signals: JOB_BOARD_NEGATIVE_SIGNALS,
  },
  {
    name: "AI & Machine Learning Positions",
    description:
      "Job openings in AI, ML, data science: model training, NLP, computer vision, MLOps, LLM engineering.",
    positive_prototypes: [
      "Senior ML engineer needed to build recommendation system at streaming platform.",
      "Hiring NLP research scientist for conversational AI team — PhD preferred.",
      "MLOps engineer role at healthcare AI company — Kubernetes and model deployment.",
      "LLM fine-tuning engineer wanted at AI-native SaaS startup — remote global.",
      "Data scientist opening at fintech — fraud detection and anomaly models.",
    ],
    negative_prototypes: [
      "OpenAI releases GPT-5 with reasoning capabilities.",
      "How to transition from software engineering to machine learning career.",
      "Stanford publishes annual AI Index report showing industry growth.",
    ],
    must_have_terms: [],
    must_not_have_terms: ["annual ai index", "career transition", "funding round", "benchmark report"],
    allowed_content_kinds: ["listing", "editorial"],
    time_window_hours: null,
    priority: 1,
    selection_profile_policy: JOB_BOARD_SELECTION_POLICY,
    candidate_positive_signals: [
      { name: "hiring_signal", cues: ["hiring", "needed", "position", "role"] },
      { name: "role_core", cues: ["ml engineer", "nlp", "computer vision", "llm", "mlops", "data scientist"] },
    ],
    candidate_negative_signals: JOB_BOARD_NEGATIVE_SIGNALS,
  },
  {
    name: "Remote Work Opportunities",
    description:
      "Fully remote and remote-first job openings across all tech roles and seniority levels.",
    positive_prototypes: [
      "Fully remote senior software engineer position at distributed-first company.",
      "Remote product designer role — work from anywhere in EU time zones.",
      "Hiring remote DevOps engineer — async-first culture with flexible hours.",
      "100% remote data analyst position at Series A climate tech startup.",
      "Remote engineering manager role leading globally distributed team of eight.",
    ],
    negative_prototypes: [
      "Study shows remote workers report higher productivity but more loneliness.",
      "Company mandates return to office three days per week starting January.",
      "Best home office setups for remote developers — gear guide.",
    ],
    must_have_terms: [],
    must_not_have_terms: ["productivity study", "return to office", "gear guide", "tax implications"],
    allowed_content_kinds: ["listing", "editorial"],
    time_window_hours: null,
    priority: 0.92,
    selection_profile_policy: JOB_BOARD_SELECTION_POLICY,
    candidate_positive_signals: [
      { name: "remote_signal", cues: ["fully remote", "remote role", "remote position", "work from anywhere"] },
      { name: "hiring_signal", cues: ["hiring", "needed", "opening", "role"] },
    ],
    candidate_negative_signals: JOB_BOARD_NEGATIVE_SIGNALS,
  },
  {
    name: "DevOps & SRE Roles",
    description:
      "Job openings for DevOps engineers, SREs, platform engineers: Kubernetes, CI/CD, cloud infrastructure, observability.",
    positive_prototypes: [
      "Senior SRE needed at payments platform — on-call rotation and incident management.",
      "DevOps engineer position at video streaming company — Terraform and AWS.",
      "Platform engineer role at fintech unicorn — Kubernetes and service mesh expertise.",
      "Hiring cloud infrastructure engineer — GCP and multi-region architecture.",
      "Site reliability engineer wanted for high-traffic e-commerce platform.",
    ],
    negative_prototypes: [
      "Kubernetes 1.32 released with improved pod scheduling.",
      "AWS re:Invent 2026 announcements roundup.",
      "How to pass the Certified Kubernetes Administrator exam.",
    ],
    must_have_terms: [],
    must_not_have_terms: ["conference roundup", "exam guide", "tool comparison", "quarterly revenue"],
    allowed_content_kinds: ["listing", "editorial"],
    time_window_hours: null,
    priority: 0.97,
    selection_profile_policy: JOB_BOARD_SELECTION_POLICY,
    candidate_positive_signals: [
      { name: "hiring_signal", cues: ["hiring", "opening", "position", "wanted"] },
      { name: "role_core", cues: ["devops", "sre", "platform engineer", "kubernetes", "terraform"] },
    ],
    candidate_negative_signals: JOB_BOARD_NEGATIVE_SIGNALS,
  },
  {
    name: "Product & Project Management Roles",
    description:
      "Job openings for product managers, project managers, program managers, and Scrum Masters in tech companies.",
    positive_prototypes: [
      "Senior product manager needed for payments platform — fintech experience required.",
      "Hiring technical program manager to lead cross-team infrastructure migration.",
      "Product manager role at AI startup — user research and data-driven roadmapping.",
      "Scrum Master position at enterprise SaaS company — scaled Agile experience.",
      "Associate product manager opening at consumer social app — early career welcome.",
    ],
    negative_prototypes: [
      "How to write a great product requirements document — PM guide.",
      "Product management salary trends for 2026.",
      "Top product management tools compared: Linear vs Jira vs Notion.",
    ],
    must_have_terms: [],
    must_not_have_terms: ["pm guide", "salary trends", "agile debate", "tool comparison"],
    allowed_content_kinds: ["listing", "editorial"],
    time_window_hours: null,
    priority: 0.9,
    selection_profile_policy: JOB_BOARD_SELECTION_POLICY,
    candidate_positive_signals: [
      { name: "hiring_signal", cues: ["hiring", "needed", "opening", "we are looking for"] },
      { name: "role_core", cues: ["product manager", "program manager", "scrum master", "project manager"] },
    ],
    candidate_negative_signals: JOB_BOARD_NEGATIVE_SIGNALS,
  },
  {
    name: "Data Engineering Jobs",
    description:
      "Job openings for data engineers: ETL/ELT pipelines, data warehousing, Spark, Airflow, dbt, streaming.",
    positive_prototypes: [
      "Senior data engineer needed to build real-time analytics pipeline — Kafka and Spark.",
      "Data engineer position at retail analytics company — dbt and Snowflake expertise.",
      "Hiring staff data engineer for data platform team — Airflow and BigQuery.",
      "Analytics engineer role at Series B startup — SQL and dbt focus.",
      "Mid-level data engineer wanted for healthcare data warehouse team — remote.",
    ],
    negative_prototypes: [
      "Snowflake reports strong quarterly earnings beating analyst expectations.",
      "Apache Spark 4.0 released with new structured streaming features.",
      "Data engineering vs data science: understanding the career differences.",
    ],
    must_have_terms: [],
    must_not_have_terms: ["earnings", "career differences", "best practices", "acquires"],
    allowed_content_kinds: ["listing", "editorial"],
    time_window_hours: null,
    priority: 0.96,
    selection_profile_policy: JOB_BOARD_SELECTION_POLICY,
    candidate_positive_signals: [
      { name: "hiring_signal", cues: ["hiring", "needed", "opening", "wanted"] },
      { name: "role_core", cues: ["data engineer", "analytics engineer", "spark", "airflow", "dbt", "snowflake"] },
    ],
    candidate_negative_signals: JOB_BOARD_NEGATIVE_SIGNALS,
  },
  {
    name: "Startup Hiring & Founding Teams",
    description:
      "Early-stage hiring: co-founder search, first engineers, founding team roles at seed and pre-seed startups.",
    positive_prototypes: [
      "YC W26 startup seeking technical co-founder with backend experience.",
      "First engineering hire at pre-seed AI startup — founding engineer role.",
      "Seed-stage climate tech company hiring CTO and first three engineers.",
      "Founding engineer position at stealth fintech startup — equity-heavy compensation.",
      "Early-stage startup hiring first product designer — shape the product from scratch.",
    ],
    negative_prototypes: [
      "Startup raises $50M Series B and plans rapid team expansion.",
      "How to find the right co-founder — startup advice column.",
      "Venture capital funding drops 20% in Q1 2026 compared to last year.",
    ],
    must_have_terms: [],
    must_not_have_terms: ["expansion plans", "startup advice", "funding drops", "accelerator applications"],
    allowed_content_kinds: ["listing", "editorial"],
    time_window_hours: null,
    priority: 0.88,
    selection_profile_policy: JOB_BOARD_SELECTION_POLICY,
    candidate_positive_signals: [
      { name: "early_stage_signal", cues: ["pre-seed", "seed-stage", "yc", "founding"] },
      { name: "hiring_signal", cues: ["seeking", "hiring", "looking for", "role"] },
    ],
    candidate_negative_signals: JOB_BOARD_NEGATIVE_SIGNALS,
  },
];

const EXAMPLE_A_CHANNELS = [
  { providerType: "rss", name: "Hacker News — Ask HN: Who is hiring?", fetchUrl: "https://hnrss.org/show?q=hiring", language: "en", pollIntervalSeconds: 300, adaptiveEnabled: true, maxPollIntervalSeconds: 1800, maxItemsPerPoll: 30, isActive: true },
  { providerType: "rss", name: "We Work Remotely — Programming", fetchUrl: "https://weworkremotely.com/categories/remote-programming-jobs.rss", language: "en", pollIntervalSeconds: 600, adaptiveEnabled: true, maxPollIntervalSeconds: 3600, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "We Work Remotely — DevOps & Sysadmin", fetchUrl: "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss", language: "en", pollIntervalSeconds: 600, adaptiveEnabled: true, maxPollIntervalSeconds: 3600, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "We Work Remotely — Management & Finance", fetchUrl: "https://weworkremotely.com/categories/remote-business-management-finance.rss", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "We Work Remotely — Design", fetchUrl: "https://weworkremotely.com/categories/remote-design-jobs.rss", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "RemoteOK — Remote Jobs Feed", fetchUrl: "https://remoteok.com/remote-jobs.rss", language: "en", pollIntervalSeconds: 600, adaptiveEnabled: true, maxPollIntervalSeconds: 3600, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "Stack Overflow Jobs — Blog", fetchUrl: "https://stackoverflow.blog/feed/", language: "en", pollIntervalSeconds: 1800, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 15, isActive: true },
  { providerType: "rss", name: "GitHub Blog — Engineering", fetchUrl: "https://github.blog/feed/", language: "en", pollIntervalSeconds: 3600, adaptiveEnabled: true, maxPollIntervalSeconds: 14400, maxItemsPerPoll: 10, isActive: true },
  { providerType: "rss", name: "LinkedIn News — Tech Industry (Google News search)", fetchUrl: "https://news.google.com/rss/search?q=tech+hiring+jobs&hl=en-US&gl=US&ceid=US:en", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "TechCrunch — Startups", fetchUrl: "https://techcrunch.com/category/startups/feed/", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "VentureBeat", fetchUrl: "https://venturebeat.com/feed/", language: "en", pollIntervalSeconds: 1200, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 15, isActive: true },
  { providerType: "rss", name: "dev.to — Career Tag", fetchUrl: "https://dev.to/feed/tag/career", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "dev.to — Hiring Tag", fetchUrl: "https://dev.to/feed/tag/hiring", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "Indeed — Software Engineer RSS", fetchUrl: "https://www.indeed.com/rss?q=software+engineer&l=remote", language: "en", pollIntervalSeconds: 1800, adaptiveEnabled: true, maxPollIntervalSeconds: 14400, maxItemsPerPoll: 20, isActive: true },
];

const EXAMPLE_B_INTEREST_TEMPLATES = [
  {
    name: "AI & LLM Breakthroughs",
    description:
      "Research breakthroughs, model releases, and significant advances in AI, large language models, and generative AI.",
    positive_prototypes: [
      "OpenAI releases GPT-5 with multimodal reasoning and tool-use capabilities.",
      "Meta open-sources a new large language model under a permissive license.",
      "Researchers discover a new sparse attention technique that cuts LLM training cost.",
    ],
    negative_prototypes: [
      "Best AI writing tools for content marketers compared and reviewed.",
      "Samsung adds AI photo editing features to a new smartphone.",
      "Celebrity uses AI-generated art for an album cover.",
    ],
    must_have_terms: ["language model", "llm", "multimodal", "model release", "alignment"],
    must_not_have_terms: ["content marketers", "smartphone", "customer service chatbot"],
    allowed_content_kinds: ["editorial", "document"],
    time_window_hours: 168,
    priority: 1,
    selection_profile_policy: {
      strictness: "balanced",
      unresolved_decision: "hold",
      llm_review_mode: "always",
    },
    candidate_positive_signals: [
      { name: "release_signal", cues: ["releases", "open-sources", "publishes research", "introduces"] },
      { name: "research_signal", cues: ["breakthrough", "alignment", "theorem proving", "sparse attention"] },
    ],
    candidate_negative_signals: [
      { name: "consumer_noise", cues: ["smartphone", "vacation itinerary", "content marketers"] },
    ],
  },
  {
    name: "Startup Funding & Launches",
    description:
      "Significant startup funding rounds, product launches, acquisitions, and accelerator news relevant to the tech ecosystem.",
    positive_prototypes: [
      "Developer tools startup raises a Series B to expand its cloud IDE platform.",
      "Observability company launches a real-time tracing product after new funding.",
      "Infrastructure startup is acquired by a major cloud platform company.",
    ],
    negative_prototypes: [
      "Food delivery startup raises funding to expand to new markets.",
      "Fitness app startup launches a wellness partnership.",
      "Real-estate tech company hits a new valuation milestone.",
    ],
    must_have_terms: ["developer tools startup", "launches", "series a", "series b", "acquired"],
    must_not_have_terms: ["food delivery", "real estate", "fashion brand", "wellness"],
    allowed_content_kinds: ["editorial", "document"],
    time_window_hours: 336,
    priority: 0.94,
    selection_profile_policy: {
      strictness: "balanced",
      unresolved_decision: "hold",
      llm_review_mode: "always",
    },
    candidate_positive_signals: [
      { name: "funding_signal", cues: ["raises", "series a", "series b", "seed round", "valuation"] },
      { name: "launch_signal", cues: ["launches", "general availability", "acquired"] },
    ],
    candidate_negative_signals: [
      { name: "consumer_noise", cues: ["food delivery", "wellness", "fashion brand"] },
    ],
  },
  {
    name: "Open Source Releases & Community",
    description:
      "New releases of open-source projects, license changes, maintainer news, and FOSS ecosystem events.",
    positive_prototypes: [
      "Rust stabilizes a new language feature in its latest release.",
      "A major open-source database changes its license and triggers community forks.",
      "SQLite adds a major new capability in a fresh release.",
    ],
    negative_prototypes: [
      "How to contribute to open source for beginners.",
      "Best open-source alternatives to commercial software in 2026.",
      "Top GitHub repositories with the most stars this month.",
    ],
    must_have_terms: ["open source", "license", "maintainer", "released", "community", "fork"],
    must_not_have_terms: ["for beginners", "best alternatives", "curated list"],
    allowed_content_kinds: ["editorial", "document"],
    time_window_hours: 336,
    priority: 0.96,
    selection_profile_policy: {
      strictness: "balanced",
      unresolved_decision: "hold",
      llm_review_mode: "always",
    },
    candidate_positive_signals: [
      { name: "release_signal", cues: ["released", "stabilizes", "adds"] },
      { name: "community_signal", cues: ["maintainer", "backlash", "forks", "foundation"] },
    ],
    candidate_negative_signals: [
      { name: "tutorial_noise", cues: ["for beginners", "curated list", "best alternatives"] },
    ],
  },
  {
    name: "Cloud & Infrastructure",
    description:
      "Cloud platform news, infrastructure tooling, Kubernetes, serverless, edge computing, and DevOps developments.",
    positive_prototypes: [
      "Kubernetes introduces a major scheduling improvement.",
      "Cloudflare launches a new edge AI runtime.",
      "An incident post-mortem reveals how a DNS misconfiguration caused a major outage.",
    ],
    negative_prototypes: [
      "Cloud computing market-share report compares AWS, GCP, and Azure.",
      "Cloud spending optimization tips for engineering managers.",
      "What is serverless computing for beginners.",
    ],
    must_have_terms: ["kubernetes", "serverless", "cloudflare", "aws", "google cloud", "incident"],
    must_not_have_terms: ["market share report", "spending optimization", "beginner explainer"],
    allowed_content_kinds: ["editorial", "document", "api_payload"],
    time_window_hours: 168,
    priority: 0.95,
    selection_profile_policy: {
      strictness: "balanced",
      unresolved_decision: "hold",
      llm_review_mode: "always",
    },
    candidate_positive_signals: [
      { name: "release_signal", cues: ["announces", "introduces", "launches", "reaches 1.0"] },
      { name: "infra_signal", cues: ["kubernetes", "serverless", "dns", "outage", "edge"] },
    ],
    candidate_negative_signals: [
      { name: "analysis_noise", cues: ["market share report", "magic quadrant", "reserved instances"] },
    ],
  },
  {
    name: "Programming Languages & Frameworks",
    description:
      "New versions, RFCs, performance benchmarks, and significant developments in programming languages and frameworks.",
    positive_prototypes: [
      "TypeScript 6.0 is released with a new type-system feature.",
      "Go proposes a new generics constraint in an RFC.",
      "Django adds async ORM batching in a major release.",
    ],
    negative_prototypes: [
      "Top 10 programming languages to learn in 2026.",
      "Python vs JavaScript for beginners.",
      "Best online courses to learn TypeScript this year.",
    ],
    must_have_terms: ["released", "rfc", "compiler", "language", "framework", "django", "next.js"],
    must_not_have_terms: ["learn in 2026", "beginners", "tutorial", "online courses"],
    allowed_content_kinds: ["editorial", "document"],
    time_window_hours: 168,
    priority: 0.93,
    selection_profile_policy: {
      strictness: "balanced",
      unresolved_decision: "hold",
      llm_review_mode: "always",
    },
    candidate_positive_signals: [
      { name: "release_signal", cues: ["released", "launched", "adds", "drops support"] },
      { name: "language_signal", cues: ["python", "typescript", "go", "swift", "django"] },
    ],
    candidate_negative_signals: [
      { name: "career_noise", cues: ["salary and demand", "online courses", "beginners"] },
    ],
  },
  {
    name: "Developer Tools & Productivity",
    description:
      "IDE updates, CLI tools, debugging innovations, CI/CD news, code review tools, and developer experience improvements.",
    positive_prototypes: [
      "JetBrains releases a new IDE with collaborative editing.",
      "GitHub Actions introduces reusable workflow templates.",
      "A new CLI tool adds type-safe HTTP requests and automatic retries.",
    ],
    negative_prototypes: [
      "Best mechanical keyboards for programmers in 2026.",
      "How to set up your terminal for maximum productivity.",
      "Top 20 VS Code themes for night coding.",
    ],
    must_have_terms: ["ide", "cli", "developer tools", "debugging", "ci/cd", "code review", "workflow"],
    must_not_have_terms: ["keyboard", "dotfiles guide", "themes", "standing desks", "pomodoro"],
    allowed_content_kinds: ["editorial", "document"],
    time_window_hours: 168,
    priority: 0.91,
    selection_profile_policy: {
      strictness: "balanced",
      unresolved_decision: "hold",
      llm_review_mode: "always",
    },
    candidate_positive_signals: [
      { name: "release_signal", cues: ["releases", "introduces", "adds", "launches"] },
      { name: "tool_signal", cues: ["ide", "cli", "workflow", "webhooks", "package manager"] },
    ],
    candidate_negative_signals: [
      { name: "gear_noise", cues: ["keyboard", "themes", "standing desks", "pomodoro"] },
    ],
  },
  {
    name: "Cybersecurity for Developers",
    description:
      "Security vulnerabilities, CVEs, supply-chain attacks, and security practices directly relevant to software developers.",
    positive_prototypes: [
      "Critical RCE vulnerability is discovered in a popular npm package.",
      "A supply-chain attack injects malicious code into packages targeting CI systems.",
      "A malicious VS Code extension steals SSH keys and environment variables.",
    ],
    negative_prototypes: [
      "Best VPN services compared for privacy and speed.",
      "Cybersecurity firm raises funding for its platform.",
      "How to create a strong password you can remember.",
    ],
    must_have_terms: ["vulnerability", "cve", "rce", "supply chain", "zero-day", "patch", "2fa"],
    must_not_have_terms: ["vpn services", "strong password", "degree program", "job market"],
    allowed_content_kinds: ["editorial", "document", "api_payload"],
    time_window_hours: 168,
    priority: 1,
    selection_profile_policy: {
      strictness: "balanced",
      unresolved_decision: "hold",
      llm_review_mode: "always",
    },
    candidate_positive_signals: [
      { name: "security_signal", cues: ["vulnerability", "cve", "zero-day", "exploited", "malicious"] },
      { name: "developer_impact", cues: ["package", "ci systems", "browser", "extension", "ssh keys"] },
    ],
    candidate_negative_signals: [
      { name: "consumer_noise", cues: ["vpn services", "strong password", "job market"] },
    ],
  },
  {
    name: "Tech Industry & Big Tech News",
    description:
      "Major moves by Big Tech: platform changes, API policy updates, regulatory actions, and industry-shaping decisions that affect developers.",
    positive_prototypes: [
      "Google deprecates a legacy API and enforces migration to new pricing tiers.",
      "EU regulation forces Meta to open an interoperability API.",
      "Twitter/X API pricing changes force third-party developers to shut down.",
    ],
    negative_prototypes: [
      "Apple reports record iPhone sales in its holiday quarter.",
      "Google Pixel review focuses on smartphone camera quality.",
      "Amazon Prime Day deals on household electronics.",
    ],
    must_have_terms: ["api", "policy update", "deprecates", "guidelines", "dma", "antitrust", "pricing changes"],
    must_not_have_terms: ["iphone sales", "smartphone", "prime day deals", "fitness routine"],
    allowed_content_kinds: ["editorial", "document"],
    time_window_hours: 168,
    priority: 0.92,
    selection_profile_policy: {
      strictness: "balanced",
      unresolved_decision: "hold",
      llm_review_mode: "always",
    },
    candidate_positive_signals: [
      { name: "policy_signal", cues: ["deprecates", "guidelines", "interoperability", "antitrust"] },
      { name: "developer_impact", cues: ["api", "migration", "pricing changes", "third-party app"] },
    ],
    candidate_negative_signals: [
      { name: "consumer_noise", cues: ["iphone sales", "smartphone", "prime day"] },
    ],
  },
];

const EXAMPLE_B_CHANNELS = [
  { providerType: "rss", name: "Hacker News — Best Stories", fetchUrl: "https://hnrss.org/best", language: "en", pollIntervalSeconds: 300, adaptiveEnabled: true, maxPollIntervalSeconds: 1800, maxItemsPerPoll: 30, isActive: true },
  { providerType: "rss", name: "Hacker News — Newest", fetchUrl: "https://hnrss.org/newest", language: "en", pollIntervalSeconds: 300, adaptiveEnabled: true, maxPollIntervalSeconds: 1800, maxItemsPerPoll: 30, isActive: true },
  { providerType: "rss", name: "TechCrunch — All", fetchUrl: "https://techcrunch.com/feed/", language: "en", pollIntervalSeconds: 300, adaptiveEnabled: true, maxPollIntervalSeconds: 3600, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "Ars Technica — Technology", fetchUrl: "https://feeds.arstechnica.com/arstechnica/technology-lab", language: "en", pollIntervalSeconds: 600, adaptiveEnabled: true, maxPollIntervalSeconds: 3600, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "The Verge — Tech", fetchUrl: "https://www.theverge.com/rss/tech/index.xml", language: "en", pollIntervalSeconds: 600, adaptiveEnabled: true, maxPollIntervalSeconds: 3600, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "dev.to — Top Articles", fetchUrl: "https://dev.to/feed", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "Lobsters", fetchUrl: "https://lobste.rs/rss", language: "en", pollIntervalSeconds: 600, adaptiveEnabled: true, maxPollIntervalSeconds: 3600, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "InfoQ — All", fetchUrl: "https://feed.infoq.com/", language: "en", pollIntervalSeconds: 1800, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 15, isActive: true },
  { providerType: "rss", name: "GitHub Blog", fetchUrl: "https://github.blog/feed/", language: "en", pollIntervalSeconds: 3600, adaptiveEnabled: true, maxPollIntervalSeconds: 14400, maxItemsPerPoll: 10, isActive: true },
  { providerType: "rss", name: "The New Stack", fetchUrl: "https://thenewstack.io/feed/", language: "en", pollIntervalSeconds: 1800, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 15, isActive: true },
  { providerType: "rss", name: "MIT Technology Review — AI", fetchUrl: "https://www.technologyreview.com/feed/", language: "en", pollIntervalSeconds: 1800, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 15, isActive: true },
  { providerType: "rss", name: "VentureBeat — AI", fetchUrl: "https://venturebeat.com/category/ai/feed/", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 15, isActive: true },
  { providerType: "rss", name: "Wired — AI & Security", fetchUrl: "https://www.wired.com/feed/rss", language: "en", pollIntervalSeconds: 1800, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 15, isActive: true },
  { providerType: "rss", name: "Changelog — Podcast & News", fetchUrl: "https://changelog.com/feed", language: "en", pollIntervalSeconds: 3600, adaptiveEnabled: true, maxPollIntervalSeconds: 14400, maxItemsPerPoll: 10, isActive: true },
  { providerType: "rss", name: "Reuters — Technology", fetchUrl: "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best&best-sectors=tech", language: "en", pollIntervalSeconds: 600, adaptiveEnabled: true, maxPollIntervalSeconds: 3600, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "BBC — Technology", fetchUrl: "https://feeds.bbci.co.uk/news/technology/rss.xml", language: "en", pollIntervalSeconds: 600, adaptiveEnabled: true, maxPollIntervalSeconds: 3600, maxItemsPerPoll: 20, isActive: true },
];

const EXAMPLE_C_CHANNELS = [
  { providerType: "rss", name: "Google News — Software Development Outsourcing", fetchUrl: "https://news.google.com/rss/search?q=%22software+development+outsourcing%22+OR+%22outsourced+software+development%22&hl=en-US&gl=US&ceid=US:en", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "Google News — IT Outsourcing & Engineering Partner", fetchUrl: "https://news.google.com/rss/search?q=%22IT+outsourcing%22+OR+%22engineering+partner%22+OR+%22technology+partner%22&hl=en-US&gl=US&ceid=US:en", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "Google News — Software Development RFP / Tender", fetchUrl: "https://news.google.com/rss/search?q=%22request+for+proposal%22+%22software+development%22+OR+%22software+development+tender%22&hl=en-US&gl=US&ceid=US:en", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 25, isActive: true },
  { providerType: "rss", name: "Google News — Mobile App Development RFP", fetchUrl: "https://news.google.com/rss/search?q=%22mobile+app+development%22+(RFP+OR+tender+OR+vendor)&hl=en-US&gl=US&ceid=US:en", language: "en", pollIntervalSeconds: 1200, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "Google News — Digital Transformation Partner Search", fetchUrl: "https://news.google.com/rss/search?q=%22digital+transformation%22+(partner+OR+vendor+OR+implementation)&hl=en-US&gl=US&ceid=US:en", language: "en", pollIntervalSeconds: 1200, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "Google News — ERP / CRM Implementation Partner", fetchUrl: "https://news.google.com/rss/search?q=(ERP+OR+CRM)+implementation+partner+OR+system+integrator&hl=en-US&gl=US&ceid=US:en", language: "en", pollIntervalSeconds: 1200, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "Google News — Cloud Migration & Data Platform Vendors", fetchUrl: "https://news.google.com/rss/search?q=(%22cloud+migration%22+OR+%22data+platform%22)+(vendor+OR+partner+OR+RFP)&hl=en-US&gl=US&ceid=US:en", language: "en", pollIntervalSeconds: 1200, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "Google News — Startup Funding & Product Build Signals", fetchUrl: "https://news.google.com/rss/search?q=(startup+raises+OR+series+A+OR+seed+funding)+(product+development+OR+engineering+team)&hl=en-US&gl=US&ceid=US:en", language: "en", pollIntervalSeconds: 1800, adaptiveEnabled: true, maxPollIntervalSeconds: 14400, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "TechCrunch — Startups", fetchUrl: "https://techcrunch.com/category/startups/feed/", language: "en", pollIntervalSeconds: 900, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 20, isActive: true },
  { providerType: "rss", name: "VentureBeat", fetchUrl: "https://venturebeat.com/feed/", language: "en", pollIntervalSeconds: 1200, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 15, isActive: true },
  { providerType: "rss", name: "Reuters — Technology", fetchUrl: "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best&best-sectors=tech", language: "en", pollIntervalSeconds: 1200, adaptiveEnabled: true, maxPollIntervalSeconds: 7200, maxItemsPerPoll: 15, isActive: true },
  { providerType: "rss", name: "The New Stack", fetchUrl: "https://thenewstack.io/feed/", language: "en", pollIntervalSeconds: 1800, adaptiveEnabled: true, maxPollIntervalSeconds: 14400, maxItemsPerPoll: 15, isActive: true },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(label, fn, timeoutMs = 300000, pollIntervalMs = 2000) {
  const startedAt = Date.now();
  let lastMessage = "";
  while (Date.now() - startedAt <= timeoutMs) {
    const snapshot = await fn();
    lastMessage = snapshot?.message ?? "";
    if (snapshot?.ok) {
      return snapshot;
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for ${label}.${lastMessage ? ` Last state: ${lastMessage}` : ""}`);
}

function normalizeSignalGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }
  return groups
    .map((group) => {
      const name = String(group?.name ?? "").trim();
      const cues = Array.isArray(group?.cues)
        ? group.cues.map((cue) => String(cue ?? "").trim()).filter(Boolean)
        : [];
      return name && cues.length > 0 ? { name, cues } : null;
    })
    .filter(Boolean);
}

function buildInterestTemplateInput(template, interestTemplateId) {
  const policy = template.selection_profile_policy ?? {};
  return {
    interestTemplateId,
    name: String(template.name ?? "").trim(),
    description: String(template.description ?? "").trim(),
    positiveTexts: Array.isArray(template.positive_prototypes)
      ? template.positive_prototypes.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    negativeTexts: Array.isArray(template.negative_prototypes)
      ? template.negative_prototypes.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    mustHaveTerms: Array.isArray(template.must_have_terms)
      ? template.must_have_terms.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    mustNotHaveTerms: Array.isArray(template.must_not_have_terms)
      ? template.must_not_have_terms.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    places: Array.isArray(template.places)
      ? template.places.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    languagesAllowed: Array.isArray(template.languages_allowed)
      ? template.languages_allowed.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    timeWindowHours:
      typeof template.time_window_hours === "number" && Number.isInteger(template.time_window_hours)
        ? template.time_window_hours
        : null,
    allowedContentKinds: Array.isArray(template.allowed_content_kinds)
      ? template.allowed_content_kinds.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    shortTokensRequired: [],
    shortTokensForbidden: [],
    candidatePositiveSignals: normalizeSignalGroups(template.candidate_positive_signals),
    candidateNegativeSignals: normalizeSignalGroups(template.candidate_negative_signals),
    selectionProfileStrictness: String(policy.strictness ?? "balanced"),
    selectionProfileUnresolvedDecision: String(policy.unresolved_decision ?? "hold"),
    selectionProfileLlmReviewMode: String(policy.llm_review_mode ?? "always"),
    priority: Number(template.priority ?? 1),
    isActive: true,
  };
}

async function loadRuntimeDependencies() {
  const [
    adminTemplatesModule,
    dbModule,
    outboxModule,
    rssChannelsModule,
  ] = await Promise.all([
    tsImport("../../apps/admin/src/lib/server/admin-templates.ts", import.meta.url),
    tsImport("../../apps/admin/src/lib/server/db.ts", import.meta.url),
    tsImport("../../apps/admin/src/lib/server/outbox.ts", import.meta.url),
    tsImport("../../apps/admin/src/lib/server/rss-channels.ts", import.meta.url),
  ]);
  return {
    getPool: dbModule.getPool,
    saveInterestTemplate: adminTemplatesModule.saveInterestTemplate,
    syncInterestTemplateCriterion: adminTemplatesModule.syncInterestTemplateCriterion,
    syncInterestTemplateSelectionProfile: adminTemplatesModule.syncInterestTemplateSelectionProfile,
    insertOutboxEvent: outboxModule.insertOutboxEvent,
    parseBulkRssAdminChannelInputs: rssChannelsModule.parseBulkRssAdminChannelInputs,
    upsertRssChannels: rssChannelsModule.upsertRssChannels,
  };
}

async function upsertInterestTemplates(pool, runtimeDependencies, templates) {
  const {
    saveInterestTemplate,
    syncInterestTemplateCriterion,
    syncInterestTemplateSelectionProfile,
    insertOutboxEvent,
  } = runtimeDependencies;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query(
      `
        select interest_template_id::text as interest_template_id, name
        from interest_templates
      `
    );
    const interestIdByName = new Map(existing.rows.map((row) => [row.name, row.interest_template_id]));

    for (const template of templates) {
      const input = buildInterestTemplateInput(
        template,
        interestIdByName.get(String(template.name ?? "").trim())
      );
      const templateResult = await saveInterestTemplate(client, input);
      const criterionSync = await syncInterestTemplateCriterion(client, templateResult.interestTemplateId);
      await syncInterestTemplateSelectionProfile(client, templateResult.interestTemplateId, input);
      if (criterionSync.compileRequested) {
        await insertOutboxEvent(client, {
          eventType: CRITERION_COMPILE_REQUESTED_EVENT,
          aggregateType: "criterion",
          aggregateId: criterionSync.criterionId,
          payload: {
            criterionId: criterionSync.criterionId,
            version: criterionSync.version,
          },
        });
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function queueReindex(pool, insertOutboxEvent) {
  const client = await pool.connect();
  const reindexJobId = randomUUID();
  try {
    await client.query("begin");
    await client.query(
      `
        insert into reindex_jobs (
          reindex_job_id,
          index_name,
          job_kind,
          options_json,
          requested_by_user_id,
          status
        )
        values ($1, $2, $3, $4::jsonb, null, 'queued')
      `,
      [reindexJobId, "interest_centroids", "rebuild", JSON.stringify({})]
    );
    await insertOutboxEvent(client, {
      eventType: REINDEX_REQUESTED_EVENT,
      aggregateType: "reindex_job",
      aggregateId: reindexJobId,
      payload: {
        reindexJobId,
        indexName: "interest_centroids",
        jobKind: "rebuild",
        version: 1,
      },
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return reindexJobId;
}

export async function seedLiveDiscoveryExampleFixtures(
  log = console.log,
  options = {},
) {
  const runtimeDependencies = await loadRuntimeDependencies();
  const pool = options.pool ?? runtimeDependencies.getPool();
  log("[seed-live-discovery] upserting Example A interest templates");
  await upsertInterestTemplates(pool, runtimeDependencies, EXAMPLE_A_INTEREST_TEMPLATES);
  log("[seed-live-discovery] upserting Example B interest templates");
  await upsertInterestTemplates(pool, runtimeDependencies, EXAMPLE_B_INTEREST_TEMPLATES);
  log("[seed-live-discovery] upserting Example C interest templates");
  await upsertInterestTemplates(pool, runtimeDependencies, OUTSOURCE_EXAMPLE_C_BUNDLE.interest_templates);

  log("[seed-live-discovery] upserting Example A/B/C RSS channels");
  const normalizedChannels = runtimeDependencies.parseBulkRssAdminChannelInputs([
    ...EXAMPLE_A_CHANNELS,
    ...EXAMPLE_B_CHANNELS,
    ...EXAMPLE_C_CHANNELS,
  ]);
  await runtimeDependencies.upsertRssChannels(pool, normalizedChannels);

  log("[seed-live-discovery] queueing interest_centroids rebuild");
  const reindexJobId = await queueReindex(pool, runtimeDependencies.insertOutboxEvent);

  // The discovery examples harness seeds both Example B and Example C admin truth,
  // but only the outsourcing bundle currently depends on compiled criterion rows for
  // downstream product proof on a clean stack. Example B remains valid as discovery
  // proof even when its interests are materialized without `criteria_compiled` rows.
  const expectedCriteria = OUTSOURCE_EXAMPLE_C_BUNDLE.interest_templates.length;
  await waitForCondition("criteria compile completion", async () => {
    const result = await pool.query(
      `
        select
          count(*)::int as total,
          count(*) filter (where compile_status = 'compiled')::int as compiled
        from criteria_compiled
      `
    );
    const row = result.rows[0] ?? {};
    const total = Number(row.total ?? 0);
    const compiled = Number(row.compiled ?? 0);
    return {
      ok: total >= expectedCriteria && compiled >= expectedCriteria,
      message: `criteria_compiled total=${total} compiled=${compiled}`,
    };
  });

  await waitForCondition("interest_centroids rebuild", async () => {
    const result = await pool.query(
      `
        select status, error_text
        from reindex_jobs
        where reindex_job_id = $1
      `,
      [reindexJobId]
    );
    const row = result.rows[0];
    if (!row) {
      return { ok: false, message: "reindex job missing" };
    }
    if (String(row.status ?? "") === "failed") {
      throw new Error(`interest_centroids rebuild failed: ${String(row.error_text ?? "unknown error")}`);
    }
    return {
      ok: String(row.status ?? "") === "completed",
      message: `status=${String(row.status ?? "unknown")}`,
    };
  });

  const counts = await pool.query(
    `
      select
        (select count(*)::int from interest_templates) as interest_templates,
        (select count(*)::int from criteria) as criteria,
        (select count(*)::int from selection_profiles) as selection_profiles,
        (select count(*)::int from source_channels where provider_type = 'rss') as rss_channels
    `
  );
  return {
    status: "ok",
    counts: counts.rows[0] ?? null,
    reindexJobId,
  };
}

async function main() {
  const runtimeDependencies = await loadRuntimeDependencies();
  const pool = runtimeDependencies.getPool();
  try {
    const result = await seedLiveDiscoveryExampleFixtures(console.log, { pool });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

const isEntrypoint =
  process.argv[1] != null
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
