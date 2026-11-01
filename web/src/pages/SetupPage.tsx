import React, { useState } from "react";
import { authClient } from "../lib/auth";
import { useToast } from "../components/ui/Toast";

interface SetupPageProps {
  onSuccess: () => void;
}

export const SetupPage: React.FC<SetupPageProps> = ({ onSuccess }) => {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupMode, setSignupMode] = useState<"INVITE" | "OPEN" | "CLOSED">("INVITE");
  const [submitting, setSubmitting] = useState(false);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setSubmitting(true);
    try {
      await authClient.signUp.credential({
        email: email.trim(),
        password,
        additionalFields: {
          purpose: "instance-setup",
          signupMode,
        },
      });
      toast.success("Instance setup complete. Administrator account initialized.");
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Setup failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-amber-800 text-amber-200 font-bold text-2xl flex items-center justify-center mx-auto shadow-md">
          ዘ
        </div>
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
          Zer Instance Initialization
        </h1>
        <p className="text-xs text-stone-500 max-w-sm mx-auto">
          Create the root instance administrator account and establish registration access policy.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-2xl border border-stone-200 shadow-xl space-y-6">
          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                Administrator Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                Master Password *
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                Default Signup Mode
              </label>
              <div className="space-y-2 text-xs">
                <label className="flex items-start gap-2 p-2.5 rounded-lg border border-stone-200 bg-stone-50 cursor-pointer">
                  <input
                    type="radio"
                    name="signup_mode"
                    value="INVITE"
                    checked={signupMode === "INVITE"}
                    onChange={() => setSignupMode("INVITE")}
                    className="mt-0.5 text-amber-600"
                  />
                  <div>
                    <span className="font-semibold text-stone-900">Invite Only (Recommended)</span>
                    <p className="text-stone-500 mt-0.5">
                      Registration requires an invitation link issued by an admin.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-lg border border-stone-200 bg-stone-50 cursor-pointer">
                  <input
                    type="radio"
                    name="signup_mode"
                    value="OPEN"
                    checked={signupMode === "OPEN"}
                    onChange={() => setSignupMode("OPEN")}
                    className="mt-0.5 text-amber-600"
                  />
                  <div>
                    <span className="font-semibold text-stone-900">Open Registration</span>
                    <p className="text-stone-500 mt-0.5">
                      Anyone can create an account and start new family trees.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs cursor-pointer mt-4"
            >
              {submitting ? "Initializing..." : "Initialize Instance"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
