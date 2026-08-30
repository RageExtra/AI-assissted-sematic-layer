const isProduction = process.env.NODE_ENV === "production";
const cookieSecret = process.env.JWT_SECRET ?? "";
const databaseUrl = process.env.DATABASE_URL ?? process.env.MONGODB_URI ?? "";

if (isProduction) {
  const missing: string[] = [];
  if (cookieSecret.length < 32 || cookieSecret === "default_secret_key_123") missing.push("JWT_SECRET (minimum 32 unpredictable characters)");
  if (!databaseUrl) missing.push("DATABASE_URL or MONGODB_URI");
  if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(", ")}`);
}

const envVars = {
  appId: process.env.VITE_APP_ID ?? "local-app",
  cookieSecret: cookieSecret || "development-only-secret-change-me",
  databaseUrl,
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "admin-local",
  isProduction,
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiApiUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
};

export const ENV = {
  ...envVars,
  forgeApiUrl: envVars.openaiApiUrl,
  forgeApiKey: envVars.openaiApiKey,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
};
