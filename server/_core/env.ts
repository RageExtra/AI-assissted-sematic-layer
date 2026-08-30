const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET must be explicitly provided in production.");
}

const envVars = {
  appId: process.env.VITE_APP_ID ?? "local-app",
  cookieSecret: process.env.JWT_SECRET ?? "default_secret_key_123",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "admin-local",
  isProduction,
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiApiUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
};

// Alias legacy Manus Forge names to prevent plugins from breaking
export const ENV = {
  ...envVars,
  forgeApiUrl: envVars.openaiApiUrl,
  forgeApiKey: envVars.openaiApiKey,
  oAuthServerUrl: "",
};
