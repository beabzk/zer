export type WorkspaceView = "overview" | "people" | "canvas" | "pedigree" | "cards" | "kinship" | "members" | "admin";

const viewSlugs: Record<WorkspaceView, string> = {
  overview: "overview",
  people: "people",
  canvas: "graph",
  pedigree: "lineage",
  cards: "lineage-cards",
  kinship: "kinship",
  members: "members",
  admin: "admin",
};

const slugViews = new Map(Object.entries(viewSlugs).map(([view, slug]) => [slug, view as WorkspaceView]));

export interface WorkspaceLocation {
  view: WorkspaceView;
  treeId: string;
}

// Parse a pathname into a workspace view plus the selected tree.
// Tree routes look like /tree/:treeId/:slug, global routes like
// /:slug or /admin. Unknown paths fall back to the overview.
export function parseLocation(pathname: string): WorkspaceLocation {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 3 && parts[0] === "tree") {
    const view = slugViews.get(parts[2]);
    if (view && view !== "admin") {
      try {
        return { view, treeId: decodeURIComponent(parts[1]) };
      } catch {
        return { view, treeId: parts[1] };
      }
    }
  }
  const slug = parts.at(-1);
  const view = (slug && slugViews.get(slug)) || "overview";
  return { view, treeId: "" };
}

export function viewFromPath(pathname = window.location.pathname): WorkspaceView {
  return parseLocation(pathname).view;
}

export function treeIdFromPath(pathname = window.location.pathname): string {
  return parseLocation(pathname).treeId;
}

export function pathForView(view: WorkspaceView, treeId: string): string {
  if (view === "admin") return "/admin";
  if (!treeId) return `/${viewSlugs[view]}`;
  return `/tree/${encodeURIComponent(treeId)}/${viewSlugs[view]}`;
}

// Views that need a selected person to render anything useful.
// Tree switches clear the person focus, so these fall back to overview.
export function viewNeedsFocus(view: WorkspaceView): boolean {
  return view === "canvas" || view === "pedigree" || view === "cards";
}

// Storage key for the last focused person in a tree. Backs the
// dashboard continue-exploring slot until the overview endpoint lands.
export function lastFocusKey(treeId: string): string {
  return `zer-last-focus-${treeId}`;
}
