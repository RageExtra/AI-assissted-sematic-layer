import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState, encodeOAuthState } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function oauthConfig() {
  return {
    authorizeUrl: process.env.OAUTH_AUTHORIZE_URL ?? "",
    tokenUrl: process.env.OAUTH_TOKEN_URL ?? "",
    userInfoUrl: process.env.OAUTH_USERINFO_URL ?? "",
    clientId: process.env.OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.OAUTH_CLIENT_SECRET ?? "",
    scope: process.env.OAUTH_SCOPE ?? "openid profile email",
  };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/login", (req: Request, res: Response) => {
    const config = oauthConfig();
    if (!config.authorizeUrl || !config.clientId) {
      res.status(503).json({ error: "OAuth is not configured for this deployment." });
      return;
    }
    const redirectUri = `${req.protocol}://${req.get("host")}/api/oauth/callback`;
    const nonce = crypto.randomUUID();
    const state = encodeOAuthState({ redirectUri, nonce });
    res.cookie(OAUTH_STATE_COOKIE, nonce, { httpOnly: true, maxAge: 600_000, sameSite: "lax", secure: req.secure, path: "/" });
    const authorization = new URL(config.authorizeUrl);
    authorization.searchParams.set("client_id", config.clientId);
    authorization.searchParams.set("redirect_uri", redirectUri);
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("scope", config.scope);
    authorization.searchParams.set("state", state);
    res.redirect(302, authorization.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) { res.status(400).json({ error: "OAuth authorization failed." }); return; }

    let statePayload: { redirectUri?: string; nonce?: string };
    try { statePayload = decodeOAuthState(state); } catch { res.status(403).json({ error: "Invalid OAuth state." }); return; }
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!statePayload.nonce || statePayload.nonce !== expectedNonce) { res.status(403).json({ error: "Invalid OAuth state." }); return; }
    res.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, path: "/", sameSite: "lax", secure: req.secure });

    const config = oauthConfig();
    if (!config.tokenUrl || !config.userInfoUrl || !config.clientId || !config.clientSecret) {
      res.status(503).json({ error: "OAuth identity provider is not configured." });
      return;
    }

    try {
      const redirectUri = statePayload.redirectUri || `${req.protocol}://${req.get("host")}/api/oauth/callback`;
      const tokenResponse = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri }),
      });
      if (!tokenResponse.ok) throw new Error(`OAuth token exchange failed with status ${tokenResponse.status}`);
      const token = await tokenResponse.json() as { access_token?: string };
      if (!token.access_token) throw new Error("OAuth provider did not return an access token.");

      const identityResponse = await fetch(config.userInfoUrl, { headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" } });
      if (!identityResponse.ok) throw new Error(`OAuth identity request failed with status ${identityResponse.status}`);
      const identity = await identityResponse.json() as { sub?: string; id?: string; name?: string; email?: string; email_verified?: boolean };
      const openId = identity.sub || identity.id;
      if (!openId) throw new Error("OAuth identity did not include a stable subject.");
      if (identity.email && identity.email_verified === false) throw new Error("OAuth email is not verified.");

      await db.upsertUser({ openId, name: identity.name || identity.email || openId, email: identity.email ?? null, loginMethod: "oauth", lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(openId, { name: identity.name || identity.email || openId, expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error instanceof Error ? error.message : "unknown error");
      res.status(502).json({ error: "Could not complete sign-in with the identity provider." });
    }
  });
}
