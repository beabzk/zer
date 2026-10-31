import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Icons } from '../components/ui/Icons';
import { formatRole } from '../lib/utils';
import { useToast } from '../components/ui/Toast';

interface TreeInvitationPageProps {
  token: string;
  onAccepted: (treeId: string) => void;
  onCancel: () => void;
}

export const TreeInvitationPage: React.FC<TreeInvitationPageProps> = ({
  token,
  onAccepted,
  onCancel,
}) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<{
    email: string;
    tree_id: string;
    tree_name: string;
    role: string;
    expires_at: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .validateTreeInvitation(token)
      .then(setInvitation)
      .catch((err) => setError(err.message || 'Invalid or expired invitation'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!invitation) return;
    setAccepting(true);
    try {
      await api.acceptTreeInvitation(token);
      toast.success(`Joined "${invitation.tree_name}" as ${formatRole(invitation.role)}`);
      onAccepted(invitation.tree_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept invitation';
      toast.error(msg);
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-amber-800 text-amber-200 font-bold text-2xl flex items-center justify-center mx-auto shadow-md">
          ዘ
        </div>
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Family Tree Invitation</h1>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-2xl border border-stone-200 shadow-xl space-y-6">
          {loading ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto" />
              <p className="text-xs text-stone-500">Validating invitation token...</p>
            </div>
          ) : error ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <Icons.X size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-stone-900">Invitation Unavailable</h3>
                <p className="text-xs text-stone-500">{error}</p>
              </div>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Return to Home
              </button>
            </div>
          ) : invitation ? (
            <div className="space-y-6 text-center">
              <div className="space-y-2">
                <p className="text-xs text-stone-500">You have been invited to collaborate on:</p>
                <h2 className="text-2xl font-bold text-stone-950">{invitation.tree_name}</h2>
                <div className="inline-block mt-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-900">
                  Role: {formatRole(invitation.role)}
                </div>
              </div>

              <div className="p-3 bg-stone-50 rounded-xl text-xs text-stone-500">
                Invitation issued to: <strong className="text-stone-800">{invitation.email}</strong>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={accepting}
                  onClick={handleAccept}
                  className="flex-1 py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs cursor-pointer"
                >
                  {accepting ? 'Joining...' : 'Accept & Open'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
