OFFICIAL_SOURCE_QUERIES = [
    '"{entity}" official blog',
    '"{entity}" newsroom',
    '"{entity}" announcements',
    '"{topic}" press releases',
]

TECHNICAL_SOURCE_QUERIES = [
    '"{entity}" changelog',
    '"{entity}" release notes',
    '"{topic}" migration guide',
    'inurl:docs "{topic}"',
]

SECURITY_SOURCE_QUERIES = [
    '"{entity}" security advisory',
    '"{entity}" vulnerability advisory',
    '"{entity}" CVE',
    '"{entity}" PSIRT',
    '"{topic}" security bulletin',
    'site:cisa.gov "{topic}" advisory',
]

PROCUREMENT_SOURCE_QUERIES = [
    '"{topic}" tender',
    '"{topic}" public procurement',
    '"{topic}" contract award',
    '"{topic}" tender notices',
    '"{topic}" procurement opportunities',
    '"{topic}" contract opportunities',
    '"{entity}" procurement opportunities',
    '"{entity}" tender search',
    '"{entity}" contract opportunities',
    '"{entity}" public tenders',
    'site:sam.gov "{topic}" opportunities',
    'site:ted.europa.eu "{topic}" tender',
    'site:find-tender.service.gov.uk "{topic}"',
    '"{topic}" przetarg',
    '"{topic}" Ausschreibung',
]

PRIMARY_DATA_SOURCE_QUERIES = [
    '"{topic}" dataset',
    '"{topic}" open data',
    '"{topic}" statistics',
    '"{topic}" data portal',
    '"{entity}" datasets',
    'site:data.gov "{topic}" dataset',
    'site:data.europa.eu "{topic}" dataset',
]

REPORT_RESEARCH_SOURCE_QUERIES = [
    '"{topic}" report',
    '"{topic}" research',
    '"{topic}" publications',
    '"{topic}" whitepaper',
    '"{entity}" publications',
    '"{entity}" research reports',
]

REGULATORY_POLICY_SOURCE_QUERIES = [
    '"{topic}" policy guidance',
    '"{topic}" regulations',
    '"{topic}" standards',
    '"{topic}" laws',
    '"{entity}" policy',
    '"{entity}" guidance',
    '"{entity}" standards',
]

HIDDEN_SIGNAL_QUERIES = [
    '{topic} implementation problem',
    '{topic} vendor replacement',
    '{topic} migration alternative',
    '{topic} implementation partner',
    '"{entity}" migration problem',
    '"{entity}" alternative migration',
    '"{entity}" "too expensive" migration',
    '"moving away from {entity}"',
]
