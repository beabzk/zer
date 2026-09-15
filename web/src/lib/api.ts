export interface Tree {
  id: string;
  name: string;
  slug: string;
  description?: string;
  default_lang: string;
  role?: string;
}

export type SignupMode = "OPEN" | "INVITE" | "CLOSED";

export interface AuthConfig {
  setup_required: boolean;
  signup_mode: SignupMode | null;
  password_enabled: boolean;
  google_enabled: boolean;
}

export interface SignupSettings {
  signup_mode: SignupMode;
  default_invite_expiry_hours: number;
}

export interface SignupInvite {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expires_at: string;
  created_at: string;
  accepted_at?: string;
  revoked_at?: string;
  invite_url?: string;
}

export interface Individual {
  id: string;
  given_name_native: string;
  given_name_latin: string;
  gender: string;
  titles?: string;
  titles_display_enabled: number;
  birth_year_ec?: number;
  birth_month_ec?: number;
  birth_day_ec?: number;
  birth_date_gc?: string;
  birth_place?: string;
  birth_note?: string;
  is_deceased: number;
  death_year_ec?: number;
  death_month_ec?: number;
  death_day_ec?: number;
  death_date_gc?: string;
  death_place?: string;
  death_note?: string;
  profile_photo_url?: string;
  full_native: string;
  full_latin: string;
  display_name?: string;
}

export interface PersonHit {
  id: string;
  full_native: string;
  full_latin: string;
  gender: string;
  birth_year_ec?: number;
  death_year_ec?: number;
  is_deceased?: boolean;
}

export interface DirectoryPage {
  individuals: PersonHit[];
  total: number;
  limit: number;
  offset: number;
}

export type DirectoryOrder = "created" | "recent" | "name";

export interface DirectoryFilters {
  limit?: number;
  offset?: number;
  order?: DirectoryOrder;
  gender?: "MALE" | "FEMALE";
  deceased?: boolean;
}

export interface OverviewPerson extends PersonHit {
  updated_at: string;
}

export interface DetailEdge extends PersonHit {
  relationship_type: string;
  is_name_source: boolean;
}

export interface DetailUnion {
  id: string;
  union_type: string;
  status: string;
  partner: PersonHit;
}

export interface PersonDetail {
  individual: Individual;
  parents: DetailEdge[];
  children: DetailEdge[];
  unions: DetailUnion[];
  events: OverviewEvent[];
  permissions: {
    can_edit: boolean;
    can_delete: boolean;
  };
}

export interface OverviewEvent {
  id: string;
  individual_id: string;
  event_type: string;
  event_date_gc?: string;
  event_year_ec?: number;
  event_place?: string;
  description?: string;
  full_native: string;
  full_latin: string;
}

export interface TreeOverview {
  tree: Tree;
  counts: {
    individuals: number;
    edges: number;
    unions: number;
    events: number;
    members: number;
  };
  recent_individuals: OverviewPerson[];
  recent_events: OverviewEvent[];
}

export interface KinshipSegment {
  from_id: string;
  to_id: string;
  relation: string;
  relationship_type?: string;
  is_name_source?: boolean;
  union_type?: string;
  union_status?: string;
}

export interface KinshipTermParameters {
  generations_up?: number;
  generations_down?: number;
  shared_parents?: number;
  known_parents_a?: number;
  known_parents_b?: number;
  union_status?: string;
  degree?: number;
  removed?: number;
  great_count?: number;
}

export interface KinshipTermComposition {
  role: string;
  key: string;
  gender: string;
  modifiers?: string[];
  union_status?: string;
}

export interface KinshipTerm {
  perspective: string;
  key: string;
  gender: string;
  modifiers?: string[];
  parameters: KinshipTermParameters;
  confidence: string;
  composition?: KinshipTermComposition[];
}

export interface KinshipResult {
  path_key: string;
  segments: KinshipSegment[];
  degrees_of_sep: number;
  individuals: Record<string, PersonHit>;
  term: KinshipTerm;
  secondary_terms?: KinshipTerm[];
}

export interface LineageNode {
  id: string;
  depth: number;
  path: string[];
}

export interface FlowNode {
  id: string;
  data: {
    given_name_native: string;
    given_name_latin: string;
    gender: string;
    full_native: string;
    full_latin: string;
    birth_year_ec?: number;
    death_year_ec?: number;
    is_deceased?: boolean;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface TreeStats {
  tree_id: string;
  individuals: number;
  edges: number;
  unions: number;
  events: number;
  members: number;
}

export interface AdminUser {
  id: number;
  email: string;
  email_verified_at?: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
  is_admin: boolean;
}

export interface AdminTree {
  id: string;
  name: string;
  slug: string;
  default_lang: string;
  created_at: string;
  members: number;
}

export interface TreeMember {
  tree_id: string;
  user_id: number;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  email: string;
  created_at: string;
}

export type TreeMemberRole = TreeMember["role"];

export interface TreeInvitation {
  id: string;
  tree_id: string;
  email: string;
  role: TreeMember["role"];
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expires_at: string;
  created_at: string;
  accepted_at?: string;
  revoked_at?: string;
  invite_url?: string;
}

export interface TreeInvitationDetails {
  email: string;
  tree_id: string;
  tree_name: string;
  role: TreeMember["role"];
  expires_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as Record<string, unknown>).error)
        : `request failed with ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

export const api = {
  auth: {
    config: () => get<AuthConfig>("/api/v1/auth/config"),
  },
  signup: {
    validateInvite: (token: string) =>
      post<{ email: string; expires_at: string }>("/api/v1/signup/invites/validate", { token }),
  },
  trees: {
    list: () => get<Tree[]>("/api/v1/trees"),
    create: (body: { name: string; slug?: string; description?: string; default_lang?: string }) =>
      post<Tree>("/api/v1/trees", body),
    stats: (treeId: string) => get<TreeStats>(`/api/v1/trees/${treeId}/stats`),
    overview: (treeId: string) => get<TreeOverview>(`/api/v1/trees/${treeId}/overview`),
    addMember: (treeId: string, body: { user_id: number; role: TreeMember["role"] }) =>
      post<TreeMember>(`/api/v1/trees/${treeId}/members`, body),
    members: (treeId: string) => get<TreeMember[]>(`/api/v1/trees/${treeId}/members`),
    updateMember: (treeId: string, userId: number, role: TreeMember["role"]) =>
      put<TreeMember>(`/api/v1/trees/${treeId}/members/${userId}`, { role }),
    removeMember: (treeId: string, userId: number) =>
      del<void>(`/api/v1/trees/${treeId}/members/${userId}`),
    invitations: (treeId: string) => get<TreeInvitation[]>(`/api/v1/trees/${treeId}/invitations`),
    createInvitation: (
      treeId: string,
      body: { email: string; role: TreeMember["role"]; expiresInHours?: number },
    ) => post<TreeInvitation>(`/api/v1/trees/${treeId}/invitations`, body),
    revokeInvitation: (treeId: string, invitationId: string) =>
      del<void>(`/api/v1/trees/${treeId}/invitations/${invitationId}`),
  },
  treeInvitations: {
    validate: (token: string) =>
      post<TreeInvitationDetails>("/api/v1/tree-invitations/validate", { token }),
    accept: (token: string) =>
      post<TreeMember>("/api/v1/tree-invitations/accept", { token }),
  },
  individuals: {
    list: (treeId: string, q?: string, opts?: DirectoryFilters) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
      if (opts?.order) params.set("order", opts.order);
      if (opts?.gender) params.set("gender", opts.gender);
      if (opts?.deceased !== undefined) params.set("deceased", String(opts.deceased));
      const suffix = params.size > 0 ? `?${params.toString()}` : "";
      return get<DirectoryPage>(`/api/v1/trees/${treeId}/individuals${suffix}`);
    },
    detail: (treeId: string, id: string, depth = 3) =>
      get<PersonDetail>(`/api/v1/trees/${treeId}/individuals/${id}/detail?depth=${depth}`),
    get: (treeId: string, id: string, depth = 3) =>
      get<Individual>(`/api/v1/trees/${treeId}/individuals/${id}?depth=${depth}`),
    create: (treeId: string, body: Record<string, unknown>) =>
      post<Individual>(`/api/v1/trees/${treeId}/individuals`, body),
    update: (treeId: string, id: string, body: Record<string, unknown>) =>
      put<Individual>(`/api/v1/trees/${treeId}/individuals/${id}`, body),
    remove: (treeId: string, id: string) =>
      del<void>(`/api/v1/trees/${treeId}/individuals/${id}`),
  },
  relationships: {
    addParentChild: (
      treeId: string,
      body: { parent_id: string; child_id: string; relationship_type?: string; is_name_source?: boolean },
    ) => post(`/api/v1/trees/${treeId}/relationships/parent-child`, body),
    updateParentChild: (
      treeId: string,
      body: { parent_id: string; child_id: string; relationship_type?: string; is_name_source?: boolean },
    ) => put(`/api/v1/trees/${treeId}/relationships/parent-child`, body),
    addUnion: (
      treeId: string,
      body: { partner_a_id: string; partner_b_id: string; union_type?: string; status?: string },
    ) => post(`/api/v1/trees/${treeId}/relationships/union`, body),
    updateUnion: (
      treeId: string,
      body: { partner_a_id: string; partner_b_id: string; union_type?: string; status?: string },
    ) => put(`/api/v1/trees/${treeId}/relationships/union`, body),
  },
  events: {
    list: (treeId: string, personId: string) =>
      get<OverviewEvent[]>(`/api/v1/trees/${treeId}/individuals/${personId}/events`),
    create: (treeId: string, personId: string, body: Record<string, unknown>) =>
      post<OverviewEvent>(`/api/v1/trees/${treeId}/individuals/${personId}/events`, body),
    update: (treeId: string, personId: string, eventId: string, body: Record<string, unknown>) =>
      put<OverviewEvent>(`/api/v1/trees/${treeId}/individuals/${personId}/events/${eventId}`, body),
    remove: (treeId: string, personId: string, eventId: string) =>
      del<void>(`/api/v1/trees/${treeId}/individuals/${personId}/events/${eventId}`),
  },
  analysis: {
    kinship: (treeId: string, a: string, b: string) =>
      get<KinshipResult>(
        `/api/v1/trees/${treeId}/analysis/kinship?person_a=${a}&person_b=${b}`,
      ),
    lineage: (treeId: string, id: string, direction: "ancestors" | "descendants", depth: number) =>
      get<{ root_id: string; direction: string; depth: number; nodes: LineageNode[] }>(
        `/api/v1/trees/${treeId}/analysis/lineage/${id}?direction=${direction}&depth=${depth}`,
      ),
    subgraph: (treeId: string, rootId: string, depth: number) =>
      get<{ nodes: FlowNode[]; edges: FlowEdge[] }>(
        `/api/v1/trees/${treeId}/graph/subgraph?root_id=${rootId}&depth=${depth}`,
      ),
  },
  admin: {
    status: () => get<{ is_admin: boolean }>("/api/v1/admin/status"),
    signupSettings: () => get<SignupSettings>("/api/v1/admin/signup-settings"),
    updateSignupSettings: (body: SignupSettings) =>
      put<SignupSettings>("/api/v1/admin/signup-settings", {
        signupMode: body.signup_mode,
        defaultInviteExpiryHours: body.default_invite_expiry_hours,
      }),
    invites: () => get<SignupInvite[]>("/api/v1/admin/invites"),
    createInvite: (body: { email: string; expiresInHours?: number }) =>
      post<SignupInvite>("/api/v1/admin/invites", body),
    revokeInvite: (inviteId: string) => del<void>(`/api/v1/admin/invites/${inviteId}`),
    users: () => get<AdminUser[]>("/api/v1/admin/users"),
    trees: () => get<AdminTree[]>("/api/v1/admin/trees"),
    deleteTree: (treeId: string) => del<void>(`/api/v1/admin/trees/${treeId}`),
    deleteUser: (userId: number) => del<void>(`/api/v1/admin/users/${userId}`),
  },
};
