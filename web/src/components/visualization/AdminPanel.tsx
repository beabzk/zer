import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  api,
  type AdminTree,
  type AdminUser,
  type SignupInvite,
  type SignupMode,
  type SignupSettings,
} from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { emailPattern } from "../../lib/validation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  Skeleton,
  useToast,
} from "../ui";

type Confirmation =
  | { kind: "tree"; id: string; label: string }
  | { kind: "user"; id: number; label: string };

interface Props {
  locale: Locale;
  onTreeDeleted?: (treeId: string) => void;
}

function errorText(locale: Locale, error: unknown): string {
  return error instanceof ApiError ? error.message : t(locale, "common.error");
}

function renderTableMessage(message: string) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{message}</p>;
}

/** Instance administration for accounts, trees, and signup access. */
export function AdminPanel({ locale, onTreeDeleted }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trees, setTrees] = useState<AdminTree[]>([]);
  const [settings, setSettings] = useState<SignupSettings>({
    signup_mode: "INVITE",
    default_invite_expiry_hours: 168,
  });
  const [invites, setInvites] = useState<SignupInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailError, setInviteEmailError] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("168");
  const [createdInviteUrl, setCreatedInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const [acting, setActing] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [treeQuery, setTreeQuery] = useState("");
  const toast = useToast();

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextUsers, nextTrees, nextSettings, nextInvites] = await Promise.all([
        api.admin.users(),
        api.admin.trees(),
        api.admin.signupSettings(),
        api.admin.invites(),
      ]);
      setUsers(nextUsers);
      setTrees(nextTrees);
      setSettings(nextSettings);
      setInviteExpiry(String(nextSettings.default_invite_expiry_hours));
      setInvites(nextInvites);
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);
  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    return query ? users.filter((user) => user.email.toLowerCase().includes(query)) : users;
  }, [userQuery, users]);
  const filteredTrees = useMemo(() => {
    const query = treeQuery.trim().toLowerCase();
    return query ? trees.filter((tree) => `${tree.name} ${tree.slug}`.toLowerCase().includes(query)) : trees;
  }, [treeQuery, trees]);
  const saveSettings = async () => {
    setActing(true);
    setError("");
    try {
      const nextSettings = await api.admin.updateSignupSettings(settings);
      setSettings(nextSettings);
      setInviteExpiry(String(nextSettings.default_invite_expiry_hours));
      toast.push({ title: t(locale, "admin.accessSaved"), variant: "success" });
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setActing(false);
    }
  };

  const createInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    if (!emailPattern.test(email)) {
      setInviteEmailError(t(locale, "admin.invalidInviteEmail"));
      return;
    }
    setActing(true);
    setError("");
    setInviteEmailError("");
    try {
      const created = await api.admin.createInvite({
        email,
        ...(inviteExpiry ? { expiresInHours: Number(inviteExpiry) } : {}),
      });
      setInviteEmail("");
      setCreatedInviteUrl(created.invite_url ?? "");
      setInvites(await api.admin.invites());
      toast.push({ title: t(locale, "admin.inviteCreated"), variant: "success" });
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setActing(false);
    }
  };

  const revokeInvite = async (invite: SignupInvite) => {
    setActing(true);
    setError("");
    try {
      await api.admin.revokeInvite(invite.id);
      setInvites(await api.admin.invites());
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setActing(false);
    }
  };

  const executeConfirmation = async () => {
    if (!confirming) return;
    setActing(true);
    setError("");
    try {
      if (confirming.kind === "tree") {
        await api.admin.deleteTree(confirming.id);
        toast.push({ title: t(locale, "admin.treeDeleted"), variant: "success" });
        await loadAdmin();
        onTreeDeleted?.(confirming.id);
      } else if (confirming.kind === "user") {
        await api.admin.deleteUser(confirming.id);
        toast.push({ title: t(locale, "admin.userDeleted"), variant: "success" });
        await loadAdmin();
      }
      setConfirming(null);
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">{t(locale, "admin.panel")}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">{t(locale, "admin.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t(locale, "admin.description")}</p>
      </section>

      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "admin.signupAccess")}</CardTitle>
          <CardDescription>{t(locale, "admin.signupAccessDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="signup-mode" className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, "auth.signupMode")}</label>
              <Select
                id="signup-mode"
                value={settings.signup_mode}
                onChange={(event) => setSettings({
                  ...settings,
                  signup_mode: event.target.value as SignupMode,
                })}
              >
                <option value="INVITE">{t(locale, "auth.modeInvite")}</option>
                <option value="OPEN">{t(locale, "auth.modeOpen")}</option>
                <option value="CLOSED">{t(locale, "auth.modeClosed")}</option>
              </Select>
            </div>
            <div>
              <label htmlFor="invite-expiry" className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, "admin.defaultExpiry")}</label>
              <Input
                id="invite-expiry"
                type="number"
                min={1}
                max={720}
                value={inviteExpiry}
                onChange={(event) => {
                  const hours = Number(event.target.value);
                  setInviteExpiry(event.target.value);
                  setSettings({ ...settings, default_invite_expiry_hours: hours });
                }}
              />
            </div>
          </div>
          <Button disabled={acting} onClick={() => void saveSettings()}>
            {t(locale, "admin.saveAccess")}
          </Button>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label htmlFor="invite-email" className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, "admin.inviteEmail")}</label>
              <Input
                id="invite-email"
                type="email"
                pattern={emailPattern.source}
                aria-invalid={Boolean(inviteEmailError)}
                aria-describedby={inviteEmailError ? "invite-email-error" : undefined}
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  setInviteEmailError("");
                }}
                placeholder="person@example.com"
              />
              {inviteEmailError && (
                <p id="invite-email-error" role="alert" className="text-xs text-destructive">
                  {inviteEmailError}
                </p>
              )}
            </div>
            <Button variant="outline" disabled={acting || !inviteEmail.trim()} onClick={() => void createInvite()}>
              {t(locale, "admin.createInvite")}
            </Button>
          </div>
          {createdInviteUrl && (
            <p className="rounded-md border border-border bg-panel-muted px-3 py-2 text-xs">
              <span className="font-semibold">{t(locale, "admin.inviteLink")}: </span>
              <a className="text-accent-strong hover:underline" href={createdInviteUrl}>{createdInviteUrl}</a>
            </p>
          )}
          {invites.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-y border-border bg-panel-muted/60 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">{t(locale, "auth.email")}</th>
                    <th className="px-4 py-2">{t(locale, "admin.status")}</th>
                    <th className="px-4 py-2">{t(locale, "admin.expires")}</th>
                    <th className="px-4 py-2">{t(locale, "admin.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id} className="border-b border-border">
                      <td className="px-4 py-2">{invite.email}</td>
                      <td className="px-4 py-2"><Badge>{invite.status}</Badge></td>
                      <td className="px-4 py-2">{new Date(invite.expires_at).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        {invite.status === "PENDING" && (
                          <Button variant="outline" size="sm" disabled={acting} onClick={() => void revokeInvite(invite)}>
                            {t(locale, "admin.revoke")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "admin.users")}</CardTitle>
          <CardDescription>{t(locale, "admin.usersDescription")}</CardDescription>
          <Input
            aria-label={t(locale, "admin.search")}
            value={userQuery}
            onChange={(event) => setUserQuery(event.target.value)}
            placeholder={t(locale, "admin.search")}
            className="mt-2 max-w-md"
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-y border-border bg-panel-muted/60 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t(locale, "admin.account")}</th>
                  <th className="px-5 py-3 font-semibold">{t(locale, "admin.created")}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t(locale, "admin.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={3} className="px-5 py-4"><Skeleton className="h-10 w-full" /></td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={3}>{renderTableMessage(t(locale, users.length === 0 ? "admin.noUsers" : "admin.noMatches"))}</td></tr>
                ) : filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{user.email}</div>
                      {user.is_admin && <Badge variant="accent" className="mt-1">{t(locale, "admin.instanceAdmin")}</Badge>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{user.created_at}</td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="danger" size="sm" onClick={() => setConfirming({ kind: "user", id: user.id, label: user.email })}>
                        {t(locale, "admin.delete")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "admin.allTrees")}</CardTitle>
          <CardDescription>{t(locale, "admin.treesDescription")}</CardDescription>
          <Input
            aria-label={t(locale, "admin.search")}
            value={treeQuery}
            onChange={(event) => setTreeQuery(event.target.value)}
            placeholder={t(locale, "admin.search")}
            className="mt-2 max-w-md"
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-y border-border bg-panel-muted/60 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t(locale, "admin.tree")}</th>
                  <th className="px-5 py-3 font-semibold">{t(locale, "admin.members")}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t(locale, "admin.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={3} className="px-5 py-4"><Skeleton className="h-10 w-full" /></td></tr>
                ) : filteredTrees.length === 0 ? (
                  <tr><td colSpan={3}>{renderTableMessage(t(locale, trees.length === 0 ? "admin.noTrees" : "admin.noMatches"))}</td></tr>
                ) : filteredTrees.map((tree) => (
                  <tr key={tree.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{tree.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{tree.slug}</div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{tree.members}</td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="danger" size="sm" onClick={() => setConfirming({ kind: "tree", id: tree.id, label: tree.name })}>
                        {t(locale, "admin.delete")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirming !== null} onClose={() => !acting && setConfirming(null)} closeLabel={t(locale, "common.close")}>
        <DialogHeader>
          <DialogTitle>{t(locale, "admin.confirmTitle")}</DialogTitle>
          <DialogDescription>
            {confirming?.kind === "tree"
              ? t(locale, "admin.confirmDeleteTree")
              : t(locale, "admin.confirmDeleteUser")}
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="break-words text-sm font-medium">{confirming?.label ?? ""}</p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(null)} disabled={acting}>{t(locale, "person.cancel")}</Button>
          <Button variant="danger" onClick={() => void executeConfirmation()} disabled={acting}>
            {t(locale, "admin.delete")}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
