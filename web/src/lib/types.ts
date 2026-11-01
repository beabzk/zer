export type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

export type Gender = "MALE" | "FEMALE";

export type RelationshipType = "BIOLOGICAL" | "ADOPTIVE" | "FOSTER";

export type UnionType = "TRADITIONAL" | "RELIGIOUS" | "CIVIL";

export type UnionStatus = "ACTIVE" | "DISSOLVED" | "WIDOWED";

export interface Tree {
  id: string;
  name: string;
  slug: string;
  description?: string;
  default_lang: string;
  role: Role;
}

export interface TreeStats {
  tree_id: string;
  individuals: number;
  edges: number;
  unions: number;
  events: number;
  members: number;
}

export interface PersonSummary {
  id: string;
  full_native: string;
  full_latin: string;
  gender: Gender;
  birth_year_ec?: number | null;
  death_year_ec?: number | null;
  is_deceased: boolean;
  updated_at?: string;
}

export interface OverviewEvent {
  id: string;
  individual_id: string;
  event_type: string;
  event_date_gc?: string | null;
  event_year_ec?: number | null;
  event_place?: string | null;
  description?: string | null;
  full_native: string;
  full_latin: string;
}

export interface TreeOverviewResponse {
  tree: Tree;
  counts: {
    individuals: number;
    edges: number;
    unions: number;
    events: number;
    members: number;
  };
  recent_individuals: PersonSummary[];
  recent_events: OverviewEvent[];
}

export interface IndividualRecord {
  id: string;
  given_name_native: string;
  given_name_latin: string;
  gender: Gender;
  titles?: string | null;
  titles_display_enabled?: number;
  birth_year_ec?: number | null;
  birth_month_ec?: number | null;
  birth_day_ec?: number | null;
  birth_date_gc?: string | null;
  birth_place?: string | null;
  birth_note?: string | null;
  is_deceased: boolean | number;
  death_year_ec?: number | null;
  death_month_ec?: number | null;
  death_day_ec?: number | null;
  death_date_gc?: string | null;
  death_place?: string | null;
  death_note?: string | null;
  profile_photo_url?: string | null;
  created_at: string;
  updated_at: string;
  full_native: string;
  full_latin: string;
  display_name?: string;
}

export interface DetailPersonEdge {
  id: string;
  full_native: string;
  full_latin: string;
  gender: Gender;
  relationship_type: RelationshipType;
  is_name_source: boolean;
}

export interface DetailUnion {
  id: string;
  union_type: UnionType;
  status: UnionStatus;
  partner: {
    id: string;
    full_native: string;
    full_latin: string;
    gender: Gender;
  };
}

export interface DetailResponse {
  individual: IndividualRecord;
  parents: DetailPersonEdge[];
  children: DetailPersonEdge[];
  unions: DetailUnion[];
  events: OverviewEvent[];
  permissions: {
    can_edit: boolean;
    can_delete: boolean;
  };
}

export interface SubgraphNode {
  id: string;
  data: {
    given_name_native: string;
    given_name_latin: string;
    gender: Gender;
    full_native: string;
    full_latin: string;
    birth_year_ec?: number | null;
    death_year_ec?: number | null;
    is_deceased: boolean;
  };
}

export interface SubgraphEdge {
  id: string;
  source: string;
  target: string;
  label: "parent" | "union";
  relationship_type?: RelationshipType;
  union_type?: UnionType;
  status?: UnionStatus;
}

export interface SubgraphResponse {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
}

export interface LineageNode {
  id: string;
  depth: number;
  path: string[];
  full_native: string;
  full_latin: string;
  gender: Gender;
  birth_year_ec?: number | null;
  death_year_ec?: number | null;
  is_deceased: boolean;
}

export interface LineageUnion {
  id: string;
  source: string;
  target: string;
}

export interface LineageResponse {
  root_id: string;
  direction: "ancestors" | "descendants";
  depth: number;
  truncated: boolean;
  nodes: LineageNode[];
  unions: LineageUnion[];
}

export interface KinshipSegment {
  from_id: string;
  to_id: string;
  relation: "PARENT" | "CHILD" | "SPOUSE";
  relationship_type?: RelationshipType;
  is_name_source?: boolean;
  union_type?: UnionType;
  union_status?: UnionStatus;
}

export interface KinshipPerson {
  id: string;
  full_native: string;
  full_latin: string;
  gender: Gender;
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
  parameters: {
    generations_up?: number;
    generations_down?: number;
    shared_parents?: number;
    known_parents_a?: number;
    known_parents_b?: number;
    union_status?: string;
    degree?: number;
    removed?: number;
    great_count?: number;
  };
  confidence: string;
  composition?: KinshipTermComposition[];
}

export interface KinshipResult {
  path_key: string;
  segments: KinshipSegment[];
  degrees_of_sep: number;
  individuals: Record<string, KinshipPerson>;
  term: KinshipTerm;
  secondary_terms?: KinshipTerm[];
}

export interface TreeMember {
  tree_id: string;
  user_id: number;
  role: Role;
  email: string;
  created_at: string;
}

export interface TreeInvitation {
  id: string;
  tree_id: string;
  email: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expires_at: string;
  created_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
  invite_url?: string;
}

export interface AuthConfig {
  setup_required: boolean;
  signup_mode?: "OPEN" | "INVITE" | "CLOSED";
  password_enabled: boolean;
  google_enabled: boolean;
}

export interface CalendarConvertResult {
  year_ec: number;
  month_ec: number;
  day_ec: number;
  year_gc: number;
  month_gc: number;
  day_gc: number;
  date_gc: string;
}

export interface AdminUser {
  id: number;
  email: string;
  email_verified_at: string | null;
  first_name: string | null;
  last_name: string | null;
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

export interface AdminSignupInvite {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invite_url?: string;
}
