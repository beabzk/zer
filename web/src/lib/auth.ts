import { createAuthClient } from "limen-auth/react";
import { credentialPasswordPlugin } from "limen-auth/plugins/credential";
import { oauthClientPlugin } from "limen-auth/plugins/oauth";

export const auth = createAuthClient({
  baseURL: window.location.origin,
  plugins: [credentialPasswordPlugin(), oauthClientPlugin()],
});

export const { useSession } = auth;
