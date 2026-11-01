import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { AdminUser, AdminTree, AdminSignupInvite } from "../lib/types";
import { Icons } from "../components/ui/Icons";
import { useToast } from "../components/ui/Toast";
import { useI18n } from "../lib/i18nContext";
import type { Locale } from "../lib/i18n";

interface AdminPageProps {
  onBack: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBack }) => {
  const toast = useToast();
  const { t, locale, setLocale, localeNames } = useI18n();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"settings" | "invites" | "users" | "trees">(
    "settings",
  );

  // Settings state
  const [signupMode, setSignupMode] = useState("INVITE");
  const [expiryHours, setExpiryHours] = useState(168);
  const [savingSettings, setSavingSettings] = useState(false);

  // Invites state
  const [invites, setInvites] = useState<AdminSignupInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState(168);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);

  // Users & Trees state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trees, setTrees] = useState<AdminTree[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api
        .getSignupSettings()
        .then((s) => {
          setSignupMode(s.signup_mode);
          setExpiryHours(s.default_invite_expiry_hours);
        })
        .catch(() => {}),
      api
        .listAdminInvites()
        .then(setInvites)
        .catch(() => {}),
      api
        .listAdminUsers()
        .then(setUsers)
        .catch(() => {}),
      api
        .listAdminTrees()
        .then(setTrees)
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.updateSignupSettings({
        signupMode,
        defaultInviteExpiryHours: expiryHours,
      });
      toast.success("Instance registration policy updated");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update settings";
      toast.error(msg);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setCreatingInvite(true);
    try {
      const res = await api.createAdminInvite({
        email: inviteEmail.trim(),
        expiresInHours: inviteExpiry,
      });
      toast.success("Registration invite issued");
      setNewInviteUrl(res.invite_url || null);
      setInviteEmail("");
      api.listAdminInvites().then(setInvites);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to issue invite";
      toast.error(msg);
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await api.revokeAdminInvite(id);
      toast.success("Invite revoked");
      api.listAdminInvites().then(setInvites);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke invite";
      toast.error(msg);
    }
  };

  const handleDeleteUser = async (userId: number, email: string) => {
    if (
      !window.confirm(
        `Permanently remove user ${email}? This will revoke all their memberships and sessions.`,
      )
    ) {
      return;
    }
    try {
      await api.deleteAdminUser(userId);
      toast.success("User removed");
      api.listAdminUsers().then(setUsers);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete user";
      toast.error(msg);
    }
  };

  const handleDeleteTree = async (treeId: string, name: string) => {
    if (!window.confirm(`Permanently drop family tree "${name}" and its isolated database?`)) {
      return;
    }
    try {
      await api.deleteAdminTree(treeId);
      toast.success("Tree database dropped");
      api.listAdminTrees().then(setTrees);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete tree";
      toast.error(msg);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copied to clipboard");
  };

  return (
    <div className="min-h-screen bg-stone-100/60 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 py-3.5 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-stone-400 hover:text-stone-800 p-1 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <Icons.ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-amber-100 text-amber-900 font-bold">
                <Icons.Shield size={16} />
              </span>
              <h1 className="text-base font-bold text-stone-900">{t("admin.title")}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Icons.Globe size={14} className="text-stone-500" />
                <span className="hidden sm:inline">{localeNames[locale]}</span>
                <span className="sm:hidden uppercase">{locale}</span>
              </button>
              {langMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-40 bg-white rounded-xl border border-stone-200 shadow-xl py-1 z-50">
                  {(Object.keys(localeNames) as Locale[]).map((loc) => (
                    <button
                      key={loc}
                      onClick={() => {
                        setLocale(loc);
                        setLangMenuOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-1.5 text-xs flex items-center justify-between hover:bg-amber-50 cursor-pointer ${
                        locale === loc
                          ? "font-bold text-amber-900 bg-amber-50/80"
                          : "text-stone-700"
                      }`}
                    >
                      <span>{localeNames[loc]}</span>
                      {locale === loc && <Icons.Check size={12} className="text-amber-700" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onBack}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 transition-colors cursor-pointer"
            >
              {t("admin.exit")}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              activeTab === "settings"
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-200/60"
            }`}
          >
            {t("admin.settingsTab")}
          </button>
          <button
            onClick={() => setActiveTab("invites")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              activeTab === "invites"
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-200/60"
            }`}
          >
            {t("admin.invitesTab")} ({invites.filter((i) => i.status === "PENDING").length})
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              activeTab === "users"
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-200/60"
            }`}
          >
            {t("admin.usersTab")} ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("trees")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              activeTab === "trees"
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-200/60"
            }`}
          >
            {t("admin.treesTab")} ({trees.length})
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-stone-500">{t("common.loading")}</p>
          </div>
        ) : activeTab === "settings" ? (
          /* Signup Settings */
          <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 max-w-xl space-y-6 shadow-xs">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{t("admin.signupAccess")}</h2>
              <p className="text-xs text-stone-500 mt-0.5">{t("admin.signupAccessDescription")}</p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                  Signup Mode
                </label>
                <div className="space-y-2 text-xs">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer">
                    <input
                      type="radio"
                      name="admin_mode"
                      value="INVITE"
                      checked={signupMode === "INVITE"}
                      onChange={() => setSignupMode("INVITE")}
                      className="mt-0.5 text-amber-600"
                    />
                    <div>
                      <span className="font-semibold text-stone-900">Invite Only (INVITE)</span>
                      <p className="text-stone-500 mt-0.5">
                        Requires an admin invite link to register.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer">
                    <input
                      type="radio"
                      name="admin_mode"
                      value="OPEN"
                      checked={signupMode === "OPEN"}
                      onChange={() => setSignupMode("OPEN")}
                      className="mt-0.5 text-amber-600"
                    />
                    <div>
                      <span className="font-semibold text-stone-900">Open Registration (OPEN)</span>
                      <p className="text-stone-500 mt-0.5">Anyone can register an account.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer">
                    <input
                      type="radio"
                      name="admin_mode"
                      value="CLOSED"
                      checked={signupMode === "CLOSED"}
                      onChange={() => setSignupMode("CLOSED")}
                      className="mt-0.5 text-amber-600"
                    />
                    <div>
                      <span className="font-semibold text-stone-900">
                        Registration Closed (CLOSED)
                      </span>
                      <p className="text-stone-500 mt-0.5">No new accounts can be created.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t("admin.defaultExpiry")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600"
                />
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                {savingSettings ? t("common.loading") : t("admin.saveAccess")}
              </button>
            </form>
          </div>
        ) : activeTab === "invites" ? (
          /* Invites Manager */
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-stone-900">Issue Registration Invite</h2>
              <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="email"
                    required
                    placeholder="newuser@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={inviteExpiry}
                    onChange={(e) => setInviteExpiry(parseInt(e.target.value, 10))}
                    className="px-2.5 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg text-stone-800 focus:outline-none"
                  >
                    <option value="24">24h</option>
                    <option value="168">7d</option>
                    <option value="720">30d</option>
                  </select>
                  <button
                    type="submit"
                    disabled={creatingInvite}
                    className="flex-1 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {creatingInvite ? "Generating..." : "Issue Invite"}
                  </button>
                </div>
              </form>

              {newInviteUrl && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5">
                  <div className="text-xs font-bold text-emerald-800">
                    Registration Link Generated
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={newInviteUrl}
                      className="w-full px-3 py-1 text-xs bg-white border border-emerald-300 rounded-lg font-mono text-emerald-950 select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(newInviteUrl)}
                      className="px-3 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                    >
                      {t("common.copy")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-stone-100 font-semibold text-sm text-stone-900">
                All Issued Registration Invites
              </div>
              <div className="divide-y divide-stone-100">
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="px-6 py-3.5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-stone-900">{inv.email}</div>
                      <div className="text-stone-400 font-mono mt-0.5">
                        Expires: {inv.expires_at.split("T")[0]}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium ${
                          inv.status === "PENDING"
                            ? "bg-amber-50 text-amber-800"
                            : inv.status === "ACCEPTED"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {inv.status}
                      </span>
                      {inv.status === "PENDING" && (
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="px-2 py-1 text-red-600 hover:bg-red-50 rounded border border-red-200 cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === "users" ? (
          /* Users Directory */
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 font-semibold text-sm text-stone-900">
              {t("admin.users")}
            </div>
            <div className="divide-y divide-stone-100">
              {users.map((u) => (
                <div key={u.id} className="px-6 py-3.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-stone-900 flex items-center gap-2">
                      <span>{u.email}</span>
                      {u.is_admin && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono font-bold text-[10px]">
                          {t("admin.roleAdmin")}
                        </span>
                      )}
                    </div>
                    <div className="text-stone-400 font-mono mt-0.5">
                      {t("admin.joined")}: {u.created_at.split("T")[0]}
                    </div>
                  </div>
                  <div>
                    {!u.is_admin && (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded border border-red-200 cursor-pointer"
                      >
                        {t("admin.delete")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Trees Directory */
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 font-semibold text-sm text-stone-900">
              {t("admin.allTrees")}
            </div>
            <div className="divide-y divide-stone-100">
              {trees.map((treeItem) => (
                <div
                  key={treeItem.id}
                  className="px-6 py-3.5 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-stone-900">{treeItem.name}</div>
                    <div className="text-stone-400 font-mono mt-0.5">
                      Slug: /{treeItem.slug} • {treeItem.members} members
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => handleDeleteTree(treeItem.id, treeItem.name)}
                      className="px-2.5 py-1 text-red-600 hover:bg-red-50 rounded border border-red-200 cursor-pointer"
                    >
                      Drop Database
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
