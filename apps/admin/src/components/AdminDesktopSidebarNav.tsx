import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@newsportal/ui";

interface AdminDesktopSidebarNavItem {
  href: string;
  label: string;
  key: string;
  iconSvg: string;
  isActive: boolean;
}

interface AdminDesktopSidebarNavSection {
  label: string;
  isActive: boolean;
  items: AdminDesktopSidebarNavItem[];
}

interface AdminDesktopSidebarSession {
  userId: string;
  roles: string[];
}

interface Props {
  sections: AdminDesktopSidebarNavSection[];
  session: AdminDesktopSidebarSession | null;
  logoutAction: string;
}

function readCompactMode(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.documentElement.dataset.adminSidebar === "compact";
}

function SidebarLink({
  item,
  compact,
}: {
  item: AdminDesktopSidebarNavItem;
  compact: boolean;
}): React.ReactElement {
  const link = (
    <a
      href={item.href}
      title={item.label}
      aria-label={item.label}
      data-admin-sidebar-link
      className={[
        "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors",
        item.isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      ].join(" ")}
    >
      <span
        className="shrink-0"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: item.iconSvg }}
      />
      <span data-admin-sidebar-link-label>{item.label}</span>
    </a>
  );

  if (!compact) {
    return link;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" align="center">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AdminDesktopSidebarNav({
  sections,
  session,
  logoutAction,
}: Props): React.ReactElement {
  const [compact, setCompact] = React.useState<boolean>(readCompactMode);
  const signOutFormRef = React.useRef<HTMLFormElement | null>(null);

  React.useEffect(() => {
    setCompact(readCompactMode());
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setCompact(readCompactMode());
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-admin-sidebar"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <TooltipProvider delayDuration={120}>
        <nav data-admin-sidebar-nav className="flex-1 space-y-4 px-2 py-3">
          {sections.map((section) => (
            <div
              key={section.label}
              className="relative"
              data-admin-sidebar-group
              data-admin-sidebar-active-section={section.isActive ? "true" : "false"}
            >
              <span
                data-admin-sidebar-section-marker
                aria-hidden="true"
                className="pointer-events-none absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-primary opacity-0 transition-opacity"
              />
              <p
                data-admin-sidebar-section-label
                className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarLink key={item.key} item={item} compact={compact} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </TooltipProvider>

      {session ? (
        <div data-admin-sidebar-footer className="mt-auto shrink-0 border-t border-border px-2 py-3">
          <div data-admin-sidebar-expanded-footer>
            <div
              data-admin-sidebar-user-card
              className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                {session.userId.charAt(0).toUpperCase()}
              </span>
              <div data-admin-sidebar-user-meta className="flex-1 overflow-hidden">
                <p className="truncate text-xs font-medium">{session.userId}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {session.roles.join(", ") || "viewer"}
                </p>
              </div>
            </div>
            <form method="post" action={logoutAction} className="mt-2">
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                data-admin-sidebar-signout
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                <span data-admin-sidebar-signout-label>Sign out</span>
              </button>
            </form>
          </div>

          <div data-admin-sidebar-compact-footer className="hidden justify-center">
            <form
              ref={signOutFormRef}
              method="post"
              action={logoutAction}
              className="hidden"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/50 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                  aria-label="Open admin account menu"
                  title="Admin account"
                >
                  {session.userId.charAt(0).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">{session.userId}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {session.roles.join(", ") || "viewer"}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    signOutFormRef.current?.requestSubmit();
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" x2="9" y1="12" y2="12" />
                  </svg>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default AdminDesktopSidebarNav;
