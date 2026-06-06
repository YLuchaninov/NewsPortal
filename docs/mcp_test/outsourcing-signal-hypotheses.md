# Outsourcing Signal Hypotheses — 30 System Interests

## 10 Direct Signals (explicit buying intent)

| # | Name | Signal Type | Keywords |
|---|------|------------|----------|
| 01 | Public RFP / Tender for IT Services | RFP | request for proposal, IT services tender, invitation to bid |
| 02 | Procurement Portal Vendor Registration | Procurement | vendor registration, supplier pre-qualification, procurement portal |
| 03 | Request for Information (RFI) for Technology | RFI | request for information, technology RFI, capability assessment |
| 04 | Request for Quotation (RFQ) for Services | RFQ | request for quotation, RFQ services, quote for IT |
| 05 | Managed Services / Staff Augmentation | Services | managed IT services, staff augmentation, contract IT staff |
| 06 | Government / Public Sector IT Tender | Gov RFP | government IT tender, public sector procurement, municipal RFP |
| 07 | Software Development Outsourcing RFP | Dev RFP | software development RFP, custom software, application modernization |
| 08 | BPO / Call Center / Back Office Outsourcing | BPO | BPO outsourcing, call center outsourcing, back office outsourcing |
| 09 | Contract Award / Vendor Selection Notice | Award | contract awarded, vendor selected, procurement award |
| 10 | Cloud / Infrastructure Services Procurement | Cloud RFP | cloud migration RFP, infrastructure services, cloud procurement |

## 20 Hidden Signals (indirect buying intent)

### Hiring & Capacity Signals (11-15)

| # | Name | Trigger | Keywords |
|---|------|--------|----------|
| 11 | Long-open IT Role (90+ days) | Capacity gap | urgent hire, backfill engineer, immediate need developer |
| 12 | New C-suite / VP in Technology | Vendor review window | new CIO, new CTO, VP Engineering hired, new IT Director |
| 13 | Engineering / IT Headcount Spike | Scaling | expanding engineering team, growing development team |
| 14 | Hiring Freeze + Contractor Roles | Budget shift | contract role IT, freelance developer, interim CTO |
| 15 | Intern / Entry-level Hiring Spike | Overflow work | IT internship, junior developer, graduate program IT |

### Corporate Change Signals (16-20)

| # | Name | Trigger | Keywords |
|---|------|--------|----------|
| 16 | M&A / Acquisition IT Integration | System consolidation | acquisition technology integration, post-merger IT |
| 17 | New Office / Market Expansion | Ops strain | new office expansion, international expansion, new market entry |
| 18 | Funding Round (Seed/Series A/B/C) | Budget available | Series A funding, venture capital, new funding round |
| 19 | PE / VC Portfolio Company | Platform consolidation | portfolio company, PE-backed company, add-on acquisition |
| 20 | Department Restructuring / Reorg | Process re-evaluation | organizational restructuring, IT transformation, reorg |

### Technology Signals (21-25)

| # | Name | Trigger | Keywords |
|---|------|--------|----------|
| 21 | Tech Stack Change / Platform Migration | Replacement cycle | migrating to new platform, legacy system replacement |
| 22 | Cloud Migration Hiring | Infrastructure scaling | AWS migration, Azure architect, Kubernetes engineer |
| 23 | AI/ML Infrastructure Investment | New workload | AI engineer, ML platform, data science team, AI model deployment |
| 24 | SOC 2 / Compliance Audit Upcoming | Security trigger | SOC 2 compliance, ISO 27001, security audit |
| 25 | Regulatory Change (DORA, NIS2, GDPR) | Forced upgrade | regulatory compliance, DORA, NIS2, GDPR requirements |

### Market & Competitive Signals (26-30)

| # | Name | Trigger | Keywords |
|---|------|--------|----------|
| 26 | Earnings Call / Investor Mention | Strategic priority | digital transformation, legacy modernization, technology investment |
| 27 | Competitor Displacement / Vendor Switch | Switching intent | switching vendor, replacing provider, vendor evaluation |
| 28 | Product Launch / New Feature | GTM infrastructure | new product launch, platform release, new service offering |
| 29 | Vendor Complaints / Negative Reviews | Dissatisfaction | vendor complaint, poor service, looking for replacement |
| 30 | Executive Job Change (new role) | Mandate + budget | new VP of, joins as CTO, appointed chief digital officer |

## Configuration Rules (all 30)

- `places: ["global"]`
- `languages_allowed: ["en"]`
- `must_not_have_terms`: China, Russia, North Korea, 中国, Россия, 朝鲜
- `negative_texts`: job posting, resume, recruitment, staffing agency, candidate (generic noise filter)
- `selection_profile_strictness`: direct signals = "balanced", hidden signals = "balanced"
- `selection_profile_unresolved_decision`: "hold"
- `selection_profile_llm_review_mode`: "optional_high_value_only"
