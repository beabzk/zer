import { useEffect, useState } from "react";
import { ApiError, api, type TreeInvitationDetails } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";
import { pathForView } from "../../lib/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "../ui";

function roleLabel(locale: Locale, role: TreeInvitationDetails["role"]): string {
  return t(locale, `admin.role${role[0]}${role.slice(1).toLowerCase()}`);
}

export function TreeInvitationView({ locale }: { locale: Locale }) {
  const [details, setDetails] = useState<TreeInvitationDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("invite") ?? "";
    if (!token) {
      setError(t(locale, "treeInvite.missing"));
      setLoading(false);
      return () => {
        active = false;
      };
    }
    api.treeInvitations.validate(token).then((invitation) => {
      if (active) setDetails(invitation);
    }).catch((cause) => {
      if (active) setError(cause instanceof ApiError ? cause.message : t(locale, "treeInvite.invalid"));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [locale]);

  const accept = async () => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("invite") ?? "";
    setAccepting(true);
    setError("");
    try {
      await api.treeInvitations.accept(token);
      setAccepted(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t(locale, "treeInvite.invalid"));
    } finally {
      setAccepting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{accepted ? t(locale, "treeInvite.accepted") : t(locale, "treeInvite.title")}</CardTitle>
          <CardDescription>
            {accepted ? t(locale, "treeInvite.acceptedDescription") : t(locale, "treeInvite.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <Skeleton className="h-24 w-full" /> : accepted ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{details?.tree_name}</p>
              <Button
                className="w-full"
                onClick={() => window.location.assign(details ? pathForView("overview", details.tree_id) : "/overview")}
              >
                {t(locale, "treeInvite.openTree")}
              </Button>
            </div>
          ) : details ? (
            <div className="space-y-4">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t(locale, "members.email")}</dt>
                  <dd className="font-medium">{details.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t(locale, "admin.tree")}</dt>
                  <dd className="font-medium">{details.tree_name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t(locale, "members.role")}</dt>
                  <dd className="font-medium">{roleLabel(locale, details.role)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t(locale, "members.expires")}</dt>
                  <dd className="font-medium">{new Date(details.expires_at).toLocaleString()}</dd>
                </div>
              </dl>
              <Button className="w-full" disabled={accepting} onClick={() => void accept()}>
                {t(locale, "treeInvite.accept")}
              </Button>
            </div>
          ) : (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          {!loading && !accepted && error && details && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
