import { useEffect, useState } from "react";
import { ApiError, api, type AdminTree, type AdminUser } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";

/** Instance admin panel: every user and tree, with delete powers. */
export function AdminPanel({ locale }: { locale: Locale }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trees, setTrees] = useState<AdminTree[]>([]);
  const [error, setError] = useState("");

  const load = () => {
    Promise.all([api.admin.users(), api.admin.trees()])
      .then(([u, tr]) => {
        setUsers(u);
        setTrees(tr);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t(locale, "common.error")));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dropTree = async (id: string) => {
    if (!window.confirm(t(locale, "admin.confirmDeleteTree"))) return;
    await api.admin.deleteTree(id).catch((e: unknown) =>
      setError(e instanceof ApiError ? e.message : t(locale, "common.error")),
    );
    load();
  };

  const dropUser = async (id: number) => {
    if (!window.confirm(t(locale, "admin.confirmDeleteUser"))) return;
    await api.admin.deleteUser(id).catch((e: unknown) =>
      setError(e instanceof ApiError ? e.message : t(locale, "common.error")),
    );
    load();
  };

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-6">
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <section>
        <h2 className="text-sm font-semibold mb-2">{t(locale, "admin.users")}</h2>
        <ul className="bg-white border rounded divide-y text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-3 py-2">
              <span>
                {u.email}
              {u.is_admin && (
                <span className="ml-2 text-xs bg-black text-white rounded px-1">
                  {t(locale, "admin.panel")}
                </span>
              )}
              </span>
              <button
                onClick={() => void dropUser(u.id)}
                className="text-xs text-red-600 hover:underline"
              >
                {t(locale, "person.delete")}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold mb-2">{t(locale, "admin.allTrees")}</h2>
        <ul className="bg-white border rounded divide-y text-sm">
          {trees.map((tr) => (
            <li key={tr.id} className="flex items-center justify-between px-3 py-2">
              <span>
                {tr.name}
                <span className="ml-2 text-xs text-gray-500">
                  {tr.members} {t(locale, "trees.members")}
                </span>
              </span>
              <button
                onClick={() => void dropTree(tr.id)}
                className="text-xs text-red-600 hover:underline"
              >
                {t(locale, "person.delete")}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
