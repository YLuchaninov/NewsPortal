export interface AdminNavItem {
  href: string;
  label: string;
  key: string;
  icon: string;
  summary: string;
}

export interface AdminNavSection {
  label: string;
  description: string;
  items: AdminNavItem[];
}

export interface AdminDashboardAction {
  href: string;
  label: string;
  summary: string;
  section: string;
}

export const ADMIN_NAV_SECTIONS: readonly AdminNavSection[] = [
  {
    label: "Home",
    description: "Operator landing zone and entry points.",
    items: [
      {
        href: "/",
        label: "Dashboard",
        key: "dashboard",
        icon: "grid",
        summary: "Needs attention, recent work, and the fastest way into live tasks.",
      },
    ],
  },
  {
    label: "Operations",
    description: "Content review and editorial triage.",
    items: [
      {
        href: "/articles",
        label: "Articles",
        key: "articles",
        icon: "newspaper",
        summary: "Review article state, moderation, and downstream selection context.",
      },
      {
        href: "/clusters",
        label: "Clusters",
        key: "clusters",
        icon: "layers",
        summary: "Inspect grouped event stories and cluster-level operational state.",
      },
    ],
  },
  {
    label: "Sources",
    description: "Acquisition, channel health, and discovery.",
    items: [
      {
        href: "/channels",
        label: "Channels",
        key: "channels",
        icon: "rss",
        summary: "Operate source channels, schedules, and provider-specific ingest setup.",
      },
      {
        href: "/discovery",
        label: "Discovery",
        key: "discovery",
        icon: "compass",
        summary: "Manage graph-first missions, recall acquisition, and candidate review.",
      },
      {
        href: "/resources",
        label: "Resources",
        key: "resources",
        icon: "database",
        summary: "Inspect website resources, projection state, and selection guidance.",
      },
    ],
  },
  {
    label: "Rules",
    description: "Selection policy, prompts, and per-user targeting.",
    items: [
      {
        href: "/templates/interests",
        label: "System Interests",
        key: "interest-templates",
        icon: "bookmark",
        summary: "Global selection logic and reusable editorial policy.",
      },
      {
        href: "/templates/llm",
        label: "LLM Templates",
        key: "llm-templates",
        icon: "file-text",
        summary: "Prompt libraries for review and operator-controlled AI behavior.",
      },
      {
        href: "/user-interests",
        label: "User Interests",
        key: "user-interests",
        icon: "users",
        summary: "On-behalf per-user matching and compile-aware targeting.",
      },
      {
        href: "/analysis",
        label: "Analysis",
        key: "analysis",
        icon: "activity",
        summary: "Content analysis results, entities, labels, and gate policies.",
      },
    ],
  },
  {
    label: "System",
    description: "Automation, maintenance, and runtime health.",
    items: [
      {
        href: "/automation",
        label: "Automation",
        key: "automation",
        icon: "workflow",
        summary: "Visual workflow workspace, recent runs, and outbox state.",
      },
      {
        href: "/observability",
        label: "Observability",
        key: "observability",
        icon: "activity",
        summary: "Fetch health, review budgets, and operator telemetry.",
      },
      {
        href: "/reindex",
        label: "Reindex",
        key: "reindex",
        icon: "refresh-cw",
        summary: "Queue bounded rebuild and repair work with explicit consequences.",
      },
    ],
  },
  {
    label: "Help",
    description: "Contextual playbooks and admin guidance.",
    items: [
      {
        href: "/help",
        label: "Admin Guide",
        key: "help",
        icon: "help-circle",
        summary: "Operational playbooks, terminology, and setup guidance.",
      },
    ],
  },
] as const;

export const ADMIN_CONTINUE_ACTIONS: readonly AdminDashboardAction[] = [
  {
    href: "/channels",
    label: "Investigate source health",
    summary: "Review channels that are overdue, paused, or failing.",
    section: "Sources",
  },
  {
    href: "/discovery",
    label: "Review discovery queues",
    summary: "Continue mission, recall, and candidate work from the discovery control plane.",
    section: "Sources",
  },
  {
    href: "/articles",
    label: "Triage article outcomes",
    summary: "Moderate blocked content and inspect selected or held rows.",
    section: "Operations",
  },
  {
    href: "/user-interests",
    label: "Act on behalf of a user",
    summary: "Find a user and update live user-interest targeting.",
    section: "Rules",
  },
  {
    href: "/observability",
    label: "Check runtime health",
    summary: "Inspect fetch throughput and AI review budget pressure.",
    section: "System",
  },
  {
    href: "/automation",
    label: "Resume workflow operations",
    summary: "Open the current workflow workspace and recent executions.",
    section: "System",
  },
] as const;

export function findAdminNavItem(activeNav?: string | null): AdminNavItem | null {
  if (!activeNav) {
    return null;
  }
  for (const section of ADMIN_NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.key === activeNav) {
        return item;
      }
    }
  }
  return null;
}

export function findAdminNavSection(activeNav?: string | null): AdminNavSection | null {
  if (!activeNav) {
    return null;
  }
  for (const section of ADMIN_NAV_SECTIONS) {
    if (section.items.some((item) => item.key === activeNav)) {
      return section;
    }
  }
  return null;
}
