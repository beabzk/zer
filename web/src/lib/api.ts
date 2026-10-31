import type {
  AuthConfig,
  CalendarConvertResult,
  Tree,
  TreeStats,
  TreeOverviewResponse,
  PersonSummary,
  IndividualRecord,
  DetailResponse,
  OverviewEvent,
  SubgraphResponse,
  LineageResponse,
  KinshipResult,
  TreeMember,
  TreeInvitation,
  AdminUser,
  AdminTree,
  AdminSignupInvite,
} from './types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = data?.error || `Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // Public
  getAuthConfig: () => request<AuthConfig>('/api/v1/auth/config'),

  validateSignupInvite: (token: string) =>
    request<{ email: string; expires_at: string }>('/api/v1/signup/invites/validate', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  convertCalendar: (params: { mode: 'ec_to_gc' | 'gc_to_ec'; year?: number; month?: number; day?: number; date?: string }) => {
    const search = new URLSearchParams();
    search.set('mode', params.mode);
    if (params.year) search.set('year', params.year.toString());
    if (params.month) search.set('month', params.month.toString());
    if (params.day) search.set('day', params.day.toString());
    if (params.date) search.set('date', params.date);
    return request<CalendarConvertResult>(`/api/v1/calendar/convert?${search.toString()}`);
  },

  // Tree Invitations
  validateTreeInvitation: (token: string) =>
    request<{ email: string; tree_id: string; tree_name: string; role: string; expires_at: string }>(
      '/api/v1/tree-invitations/validate',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      }
    ),

  acceptTreeInvitation: (token: string) =>
    request<TreeMember>('/api/v1/tree-invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  // Trees
  listTrees: () => request<Tree[]>('/api/v1/trees'),

  createTree: (body: { name: string; slug?: string; description?: string; default_lang?: string }) =>
    request<Tree>('/api/v1/trees', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getTreeStats: (treeId: string) => request<TreeStats>(`/api/v1/trees/${treeId}/stats`),

  getTreeOverview: (treeId: string) => request<TreeOverviewResponse>(`/api/v1/trees/${treeId}/overview`),

  // Individuals
  listIndividuals: (
    treeId: string,
    params?: {
      q?: string;
      limit?: number;
      offset?: number;
      order?: 'created' | 'recent' | 'name';
      gender?: 'MALE' | 'FEMALE';
      deceased?: 'true' | 'false';
    }
  ) => {
    const search = new URLSearchParams();
    if (params?.q) search.set('q', params.q);
    if (params?.limit) search.set('limit', params.limit.toString());
    if (params?.offset) search.set('offset', params.offset.toString());
    if (params?.order) search.set('order', params.order);
    if (params?.gender) search.set('gender', params.gender);
    if (params?.deceased) search.set('deceased', params.deceased);
    const query = search.toString();
    return request<{
      individuals: PersonSummary[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/v1/trees/${treeId}/individuals${query ? `?${query}` : ''}`);
  },

  getIndividual: (treeId: string, id: string, titles = true) =>
    request<IndividualRecord>(`/api/v1/trees/${treeId}/individuals/${id}${titles ? '?titles=1' : '?titles=0'}`),

  getIndividualDetail: (treeId: string, id: string, depth = 3) =>
    request<DetailResponse>(`/api/v1/trees/${treeId}/individuals/${id}/detail?depth=${depth}`),

  createIndividual: (treeId: string, body: Record<string, unknown>) =>
    request<IndividualRecord>(`/api/v1/trees/${treeId}/individuals`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateIndividual: (treeId: string, id: string, body: Record<string, unknown>) =>
    request<IndividualRecord>(`/api/v1/trees/${treeId}/individuals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteIndividual: (treeId: string, id: string) =>
    request<void>(`/api/v1/trees/${treeId}/individuals/${id}`, {
      method: 'DELETE',
    }),

  // Events
  listEvents: (treeId: string, individualId: string) =>
    request<OverviewEvent[]>(`/api/v1/trees/${treeId}/individuals/${individualId}/events`),

  createEvent: (treeId: string, individualId: string, body: Record<string, unknown>) =>
    request<OverviewEvent>(`/api/v1/trees/${treeId}/individuals/${individualId}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateEvent: (treeId: string, individualId: string, eventId: string, body: Record<string, unknown>) =>
    request<OverviewEvent>(`/api/v1/trees/${treeId}/individuals/${individualId}/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteEvent: (treeId: string, individualId: string, eventId: string) =>
    request<void>(`/api/v1/trees/${treeId}/individuals/${individualId}/events/${eventId}`, {
      method: 'DELETE',
    }),

  // Relationships
  addParentChild: (
    treeId: string,
    body: {
      parent_id: string;
      child_id: string;
      relationship_type?: 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER';
      is_name_source?: boolean;
    }
  ) =>
    request<{ id: string; parent_id: string; child_id: string; relationship_type: string; is_name_source: boolean }>(
      `/api/v1/trees/${treeId}/relationships/parent-child`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  updateParentChild: (
    treeId: string,
    body: {
      parent_id: string;
      child_id: string;
      relationship_type?: 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER';
      is_name_source?: boolean;
    }
  ) =>
    request<{ parent_id: string; child_id: string }>(`/api/v1/trees/${treeId}/relationships/parent-child`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  addUnion: (
    treeId: string,
    body: {
      partner_a_id: string;
      partner_b_id: string;
      union_type?: 'TRADITIONAL' | 'RELIGIOUS' | 'CIVIL';
      status?: 'ACTIVE' | 'DISSOLVED' | 'WIDOWED';
    }
  ) =>
    request<{ id: string; partner_a_id: string; partner_b_id: string; union_type: string; status: string }>(
      `/api/v1/trees/${treeId}/relationships/union`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  updateUnion: (
    treeId: string,
    body: {
      partner_a_id: string;
      partner_b_id: string;
      union_type?: 'TRADITIONAL' | 'RELIGIOUS' | 'CIVIL';
      status?: 'ACTIVE' | 'DISSOLVED' | 'WIDOWED';
    }
  ) =>
    request<{ id: string; partner_a_id: string; partner_b_id: string; union_type: string; status: string }>(
      `/api/v1/trees/${treeId}/relationships/union`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    ),

  // Analysis & Graph
  getKinship: (treeId: string, personA: string, personB: string) =>
    request<KinshipResult>(
      `/api/v1/trees/${treeId}/analysis/kinship?person_a=${encodeURIComponent(personA)}&person_b=${encodeURIComponent(
        personB
      )}`
    ),

  getLineage: (treeId: string, id: string, direction: 'ancestors' | 'descendants' = 'ancestors', depth = 6) =>
    request<LineageResponse>(`/api/v1/trees/${treeId}/analysis/lineage/${id}?direction=${direction}&depth=${depth}`),

  getSubgraph: (treeId: string, rootId: string, depth = 3) =>
    request<SubgraphResponse>(`/api/v1/trees/${treeId}/graph/subgraph?root_id=${rootId}&depth=${depth}`),

  // Members
  listMembers: (treeId: string) => request<TreeMember[]>(`/api/v1/trees/${treeId}/members`),

  addMember: (treeId: string, userId: number, role: string) =>
    request<TreeMember>(`/api/v1/trees/${treeId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, role }),
    }),

  updateMember: (treeId: string, userId: number, role: string) =>
    request<TreeMember>(`/api/v1/trees/${treeId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  removeMember: (treeId: string, userId: number) =>
    request<void>(`/api/v1/trees/${treeId}/members/${userId}`, {
      method: 'DELETE',
    }),

  // Tree Invitations
  listTreeInvitations: (treeId: string) => request<TreeInvitation[]>(`/api/v1/trees/${treeId}/invitations`),

  createTreeInvitation: (treeId: string, body: { email: string; role: string; expiresInHours?: number }) =>
    request<TreeInvitation>(`/api/v1/trees/${treeId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  revokeTreeInvitation: (treeId: string, invitationId: string) =>
    request<void>(`/api/v1/trees/${treeId}/invitations/${invitationId}`, {
      method: 'DELETE',
    }),

  // Admin
  getAdminStatus: () => request<{ is_admin: boolean }>('/api/v1/admin/status'),

  getSignupSettings: () => request<{ signup_mode: string; default_invite_expiry_hours: number }>('/api/v1/admin/signup-settings'),

  updateSignupSettings: (body: { signupMode: string; defaultInviteExpiryHours: number }) =>
    request<{ signup_mode: string; default_invite_expiry_hours: number }>('/api/v1/admin/signup-settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  listAdminInvites: () => request<AdminSignupInvite[]>('/api/v1/admin/invites'),

  createAdminInvite: (body: { email: string; expiresInHours?: number }) =>
    request<AdminSignupInvite>('/api/v1/admin/invites', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  revokeAdminInvite: (inviteId: string) =>
    request<void>(`/api/v1/admin/invites/${inviteId}`, {
      method: 'DELETE',
    }),

  listAdminUsers: () => request<AdminUser[]>('/api/v1/admin/users'),

  deleteAdminUser: (userId: number) =>
    request<void>(`/api/v1/admin/users/${userId}`, {
      method: 'DELETE',
    }),

  listAdminTrees: () => request<AdminTree[]>('/api/v1/admin/trees'),

  deleteAdminTree: (treeId: string) =>
    request<void>(`/api/v1/admin/trees/${treeId}`, {
      method: 'DELETE',
    }),
};
