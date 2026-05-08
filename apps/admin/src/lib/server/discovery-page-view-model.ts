import { resolveAdminAppPath } from "./browser-flow";

type RuntimeConfig = {
  apiBaseUrl: string;
  discoveryMonthlyBudgetCents: number;
  discoverySearchProvider: string;
  discoveryLlmModel: string;
};

export function buildDiscoveryPageLinks(input: {
  request: Request;
  url: URL;
  tab: string;
}) {
  const appPath = (target = "/") => resolveAdminAppPath(input.request, target);
  const currentPath = `${input.url.pathname}${input.url.search}`;

  return {
    appPath,
    bffPath: appPath("/bff/admin/discovery"),
    currentPath,
    pagePaths: {
      dashboard: appPath("/"),
      discovery: appPath("/discovery"),
      targets: appPath("/discovery"),
      runs: appPath("/discovery"),
      endpoints: appPath("/discovery"),
      contracts: appPath("/discovery"),
      claims: appPath("/discovery"),
      guards: appPath("/discovery"),
    },
    resolveMissionScopedHref: () => appPath("/discovery"),
    resolvePageHref: () => appPath("/discovery"),
    resolveSelectionHref: () => appPath("/discovery"),
    tabs: [
      { key: "targets", label: "Targets", href: appPath("/discovery") },
      { key: "runs", label: "Runs", href: appPath("/discovery") },
      { key: "endpoints", label: "Endpoints", href: appPath("/discovery") },
      { key: "contracts", label: "Contracts", href: appPath("/discovery") },
      { key: "claims", label: "Claims", href: appPath("/discovery") },
      { key: "guards", label: "Guards", href: appPath("/discovery") },
    ],
  };
}

export async function buildDiscoveryPageViewModel(input: {
  runtimeConfig: RuntimeConfig;
  url: URL;
  fetchImpl: typeof fetch;
}) {
  void input;
  return {
    summary: {},
    targets: { items: [] },
    runs: { items: [] },
    endpoints: { items: [] },
    contracts: { items: [] },
    claims: { items: [] },
    negativeEvidence: { items: [] },
    providerHealth: { items: [] },
    evalSuites: { items: [] },
    legacyRetired: true,
  };
}
