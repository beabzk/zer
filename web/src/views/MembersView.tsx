import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { TreeMember, TreeInvitation, Role } from '../lib/types';
import { Icons } from '../components/ui/Icons';
import { getLocalizedRole } from '../lib/utils';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { useI18n } from '../lib/i18nContext';

interface MembersViewProps {
  treeId: string;
  userRole?: Role;
}

export const MembersView: React.FC<MembersViewProps> = ({ treeId, userRole }) => {
  const toast = useToast();
  const { t } = useI18n();
  const [members, setMembers] = useState<TreeMember[]>([]);
  const [invitations, setInvitations] = useState<TreeInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite Modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'EDITOR' | 'VIEWER'>('EDITOR');
  const [inviteExpiry, setInviteExpiry] = useState(168);
  const [inviting, setInviting] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);

  const canManage = userRole === 'OWNER' || userRole === 'ADMIN';

  const loadData = () => {
    setLoading(true);
    const p1 = api.listMembers(treeId).then(setMembers).catch(() => {});
    const p2 = canManage
      ? api.listTreeInvitations(treeId).then(setInvitations).catch(() => {})
      : Promise.resolve();

    Promise.all([p1, p2]).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [treeId, userRole]);

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await api.updateMember(treeId, userId, newRole);
      toast.success(t('members.roleUpdated'));
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update member role';
      toast.error(msg);
    }
  };

  const handleRemoveMember = async (userId: number, _email: string) => {
    if (!window.confirm(t('members.confirmRemove'))) return;
    try {
      await api.removeMember(treeId, userId);
      toast.success(t('members.memberRemoved'));
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member';
      toast.error(msg);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error(t('members.invalidEmail'));
      return;
    }

    setInviting(true);
    try {
      const inv = await api.createTreeInvitation(treeId, {
        email: inviteEmail.trim(),
        role: inviteRole,
        expiresInHours: inviteExpiry,
      });
      toast.success(t('members.invitationSent'));
      setNewInviteUrl(inv.invite_url || null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create invitation';
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    try {
      await api.revokeTreeInvitation(treeId, invitationId);
      toast.success('Invitation revoked');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke invitation';
      toast.error(msg);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Link copied to clipboard');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
            {t('members.title')}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {t('members.description')}
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => {
              setNewInviteUrl(null);
              setInviteEmail('');
              setInviteRole('EDITOR');
              setInviteModalOpen(true);
            }}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-medium transition-colors shadow-xs flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <Icons.Plus size={16} /> {t('members.inviteTitle')}
          </button>
        )}
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-900">{t('members.currentTitle')} ({members.length})</h3>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-stone-500">{t('common.loading')}</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {members.map((member) => (
              <div
                key={member.user_id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/50 transition-colors"
              >
                <div>
                  <div className="font-semibold text-stone-900 text-sm">{member.email}</div>
                  <div className="text-[11px] text-stone-400 mt-0.5 font-mono">
                    {t('members.joined')}: {member.created_at.split('T')[0]}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {canManage && member.role !== 'OWNER' ? (
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                      className="px-2.5 py-1 text-xs bg-stone-50 border border-stone-200 rounded-lg text-stone-800 font-medium focus:outline-none focus:border-amber-600"
                    >
                      <option value="ADMIN">{t('admin.roleAdmin')}</option>
                      <option value="EDITOR">{t('admin.roleEditor')}</option>
                      <option value="VIEWER">{t('admin.roleViewer')}</option>
                    </select>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-stone-100 text-stone-700 font-mono">
                      {getLocalizedRole(member.role, t)}
                    </span>
                  )}

                  {canManage && member.role !== 'OWNER' && (
                    <button
                      onClick={() => handleRemoveMember(member.user_id, member.email)}
                      className="p-1 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title={t('members.remove')}
                    >
                      <Icons.Trash size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invitations Table (Admins & Owners only) */}
      {canManage && (
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-900">
              {t('members.pendingTitle')} ({invitations.filter((i) => i.status === 'PENDING').length})
            </h3>
          </div>

          {invitations.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400">{t('members.noInvitations')}</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/50 transition-colors"
                >
                  <div>
                    <div className="font-semibold text-stone-900 text-sm flex items-center gap-2">
                      <span>{inv.email}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          inv.status === 'PENDING'
                            ? 'bg-amber-50 text-amber-800'
                            : inv.status === 'ACCEPTED'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-stone-100 text-stone-500'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-400 mt-0.5 font-mono">
                      {t('members.role')}: {getLocalizedRole(inv.role, t)} • {t('members.expires')}: {inv.expires_at.split('T')[0]}
                    </div>
                  </div>

                  {inv.status === 'PENDING' && (
                    <div className="flex items-center gap-2">
                      {inv.invite_url && (
                        <button
                          onClick={() => copyToClipboard(inv.invite_url!)}
                          className="px-2.5 py-1 text-xs border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-lg flex items-center gap-1.5 cursor-pointer font-medium"
                        >
                          <Icons.Copy size={13} /> {t('members.invitationLink')}
                        </button>
                      )}
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="px-2.5 py-1 text-xs border border-red-200 hover:bg-red-50 text-red-600 rounded-lg cursor-pointer font-medium"
                      >
                        {t('members.revoke')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invite Member Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title={t('members.inviteTitle')}
        subtitle={t('members.description')}
        maxWidth="md"
      >
        {newInviteUrl ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                {t('members.invitationSent')}
              </div>
              <p className="text-xs text-emerald-700">
                Share this direct link with <strong>{inviteEmail}</strong> to grant access:
              </p>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  readOnly
                  value={newInviteUrl}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg font-mono text-emerald-950 select-all"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(newInviteUrl)}
                  className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
                >
                  {t('common.copy')}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-medium cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendInvite} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                {t('members.email')} *
              </label>
              <input
                type="email"
                required
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                {t('members.role')}
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'EDITOR' | 'VIEWER')}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              >
                <option value="ADMIN">{t('admin.roleAdmin')}</option>
                <option value="EDITOR">{t('admin.roleEditor')}</option>
                <option value="VIEWER">{t('admin.roleViewer')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                {t('members.expiresIn')}
              </label>
              <select
                value={inviteExpiry}
                onChange={(e) => setInviteExpiry(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              >
                <option value="24">{t('members.expiry24Hours')}</option>
                <option value="168">{t('members.expiry7Days')}</option>
                <option value="720">{t('members.expiry30Days')}</option>
              </select>
            </div>

            <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              >
                {t('person.cancel')}
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="px-5 py-2 text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                {inviting ? t('common.loading') : t('members.send')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
