import { createAuthClient } from "limen-auth/react";
import { credentialPasswordPlugin, oauthClientPlugin } from "limen-auth/plugins";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [credentialPasswordPlugin(), oauthClientPlugin()],
});

export const useSession = authClient.useSession;
