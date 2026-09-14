import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  type TreeInvitation,
  type TreeMember,
  type TreeMemberRole,
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
  Empty,
  Input,
  Select,
  Skeleton,
  useToast,
} from "../ui";

const memberRoles: TreeMemberRole[] = ["OWNER", "ADMIN", "EDITOR", "VIEWER"];

interface Props {
  locale: Locale;
  treeId: string;
  treeName: string;
  callerRole: TreeMemberRole;
}

function errorText(locale: Locale, error: unknown): string {
  return error instanceof ApiError ? error.message : t(locale, "common.error");
}

function roleLabel(locale: Locale, role: TreeMemberRole): string {
  return t(locale, `admin.role${role[0]}${role.slice(1).toLowerCase()}`);
}

function roleVariant(role: TreeMemberRole): "neutral" | "accent" | "success" | "warning" {
  if (role === "OWNER") return "warning";
  if (role === "ADMIN") return "accent";
  if (role === "EDITOR") return "success";
  return "neutral";
}

export function TreeMembersPanel({ locale, treeId, treeName, callerRole }: Props) {
  const [members, setMembers] = useState<TreeMember[]>([]);
  const [invitations, setInvitations] = useState<TreeInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailError, setInviteEmailError] = useState("");
  const [inviteRole, setInviteRole] = useState<TreeMemberRole>("EDITOR");
  const [inviteExpiry, setInviteExpiry] = useState("168");
  const [createdInviteUrl, setCreatedInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [pendingRole, setPendingRole] = useState<number | null>(null);
  const [removing, setRemoving] = useState<TreeMember | null>(null);
  const toast = useToast();
  const isOwner = callerRole === "OWNER";
  const assignableRoles: TreeMemberRole[] = isOwner ? ["ADMIN", "EDITOR", "VIEWER"] : ["EDITOR", "VIEWER"];
  const memberRoleOptions: TreeMemberRole[] = isOwner ? memberRoles : ["EDITOR", "VIEWER"];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        api.trees.members(treeId),
        api.trees.invitations(treeId),
      ]);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setLoading(false);
    }
  }, [locale, treeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateRole = async (member: TreeMember, role: TreeMemberRole) => {
    if (role === member.role) return;
    setPendingRole(member.user_id);
    setError("");
    try {
      const updated = await api.trees.updateMember(treeId, member.user_id, role);
      setMembers((current) => current.map((item) => (item.user_id === updated.user_id ? updated : item)));
      toast.push({ title: t(locale, "members.roleUpdated"), variant: "success" });
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setPendingRole(null);
    }
  };

  const createInvitation = async () => {
    const email = inviteEmail.trim();
    if (!emailPattern.test(email)) {
      setInviteEmailError(t(locale, "members.invalidEmail"));
      return;
    }
    setActing(true);
    setError("");
    setInviteEmailError("");
    try {
      const created = await api.trees.createInvitation(treeId, {
        email,
        role: inviteRole,
        expiresInHours: Number(inviteExpiry) || 168,
      });
      setInviteEmail("");
      setCreatedInviteUrl(created.invite_url ?? "");
      setInvitations(await api.trees.invitations(treeId));
      toast.push({ title: t(locale, "members.invitationSent"), variant: "success" });
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setActing(false);
    }
  };

  const revokeInvitation = async (invitation: TreeInvitation) => {
    setActing(true);
    setError("");
    try {
      await api.trees.revokeInvitation(treeId, invitation.id);
      setInvitations(await api.trees.invitations(treeId));
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setActing(false);
    }
  };

  const removeMember = async () => {
    if (!removing) return;
    setActing(true);
    setError("");
    try {
      await api.trees.removeMember(treeId, removing.user_id);
      setMembers((current) => current.filter((member) => member.user_id !== removing.user_id));
      setRemoving(null);
      toast.push({ title: t(locale, "members.memberRemoved"), variant: "success" });
    } catch (cause) {
      setError(errorText(locale, cause));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">{t(locale, "members.eyebrow")}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">{t(locale, "members.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t(locale, "members.description")}</p>
      </section>

      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "members.inviteTitle")}</CardTitle>
          <CardDescription>{treeName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_9rem_auto] sm:items-end">
            <div>
              <label htmlFor="invite-email" className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, "members.email")}</label>
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
              {inviteEmailError && <p id="invite-email-error" role="alert" className="mt-1 text-xs text-destructive">{inviteEmailError}</p>}
            </div>
            <div>
              <label htmlFor="invite-role" className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, "members.role")}</label>
              <Select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as TreeMemberRole)}>
                {assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(locale, role)}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="invite-expiry" className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(locale, "members.expiresIn")}</label>
              <Input id="invite-expiry" type="number" min={1} max={720} value={inviteExpiry} onChange={(event) => setInviteExpiry(event.target.value)} />
            </div>
            <Button disabled={acting || !inviteEmail.trim()} onClick={() => void createInvitation()}>
              {t(locale, "members.send")}
            </Button>
          </div>
          {createdInviteUrl && (
            <p className="rounded-md border border-border bg-panel-muted px-3 py-2 text-xs">
              <span className="font-semibold">{t(locale, "members.invitationLink")}: </span>
              <a className="text-accent-strong hover:underline" href={createdInviteUrl}>{createdInviteUrl}</a>
            </p>
          )}
          {invitations.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-y border-border bg-panel-muted/60 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">{t(locale, "members.email")}</th>
                    <th className="px-4 py-2">{t(locale, "members.role")}</th>
                    <th className="px-4 py-2">{t(locale, "members.status")}</th>
                    <th className="px-4 py-2">{t(locale, "members.expires")}</th>
                    <th className="px-4 py-2 text-right">{t(locale, "members.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className="border-b border-border">
                      <td className="px-4 py-2">{invitation.email}</td>
                      <td className="px-4 py-2">{roleLabel(locale, invitation.role)}</td>
                      <td className="px-4 py-2"><Badge>{invitation.status}</Badge></td>
                      <td className="px-4 py-2">{new Date(invitation.expires_at).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        {invitation.status === "PENDING" && (
                          <Button variant="outline" size="sm" disabled={acting} onClick={() => void revokeInvitation(invitation)}>
                            {t(locale, "members.revoke")}
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
          <CardTitle>{t(locale, "members.currentTitle")}</CardTitle>
          <CardDescription>{treeName}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : members.length === 0 ? (
            <Empty title={t(locale, "members.noMembers")} description={t(locale, "members.noMembersDescription")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-y border-border bg-panel-muted/60 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t(locale, "members.account")}</th>
                    <th className="px-4 py-3 font-semibold">{t(locale, "members.role")}</th>
                    <th className="px-4 py-3 font-semibold">{t(locale, "members.joined")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t(locale, "members.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((member) => {
                    const canManageMember = isOwner || member.role === "EDITOR" || member.role === "VIEWER";
                    const roleOptions = memberRoleOptions.includes(member.role)
                      ? memberRoleOptions
                      : [member.role, ...memberRoleOptions];
                    return (
                    <tr key={member.user_id}>
                      <td className="px-4 py-3 font-medium">{member.email}</td>
                      <td className="px-4 py-3">
                        <label className="sr-only" htmlFor={`member-role-${member.user_id}`}>{member.email}</label>
                        <div className="flex items-center gap-2">
                          <Select
                            id={`member-role-${member.user_id}`}
                            value={member.role}
                            disabled={pendingRole === member.user_id || acting || !canManageMember}
                            onChange={(event) => void updateRole(member, event.target.value as TreeMemberRole)}
                            className="h-9 max-w-36"
                          >
                            {roleOptions.map((role) => <option key={role} value={role}>{roleLabel(locale, role)}</option>)}
                          </Select>
                          <Badge variant={roleVariant(member.role)}>{roleLabel(locale, member.role)}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{member.created_at}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="danger" size="sm" aria-label={`${t(locale, "members.remove")} ${member.email}`} onClick={() => setRemoving(member)} disabled={acting || !canManageMember}>
                          {t(locale, "members.remove")}
                        </Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={removing !== null} onClose={() => !acting && setRemoving(null)} closeLabel={t(locale, "common.close")}>
        <DialogHeader>
          <DialogTitle>{t(locale, "members.removeMember")}</DialogTitle>
          <DialogDescription>{t(locale, "members.confirmRemove")}</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <p className="break-words text-sm font-medium">{removing?.email}</p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRemoving(null)} disabled={acting}>{t(locale, "person.cancel")}</Button>
          <Button variant="danger" onClick={() => void removeMember()} disabled={acting}>{t(locale, "members.removeMember")}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
