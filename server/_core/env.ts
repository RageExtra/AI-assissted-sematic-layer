const envVars = {
  appId: process.env.VITE_APP_ID ?? "local-app",
  cookieSecret: process.env.JWT_SECRET ?? "default_secret_key_123",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "admin-local",
  isProduction: process.env.NODE_ENV === "production",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiApiUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
};

// Alias legacy Manus Forge names to prevent plugins from breaking
export const ENV = {
  ...envVars,
  forgeApiUrl: envVars.openaiApiUrl,
  forgeApiKey: envVars.openaiApiKey,
  oAuthServerUrl: "",
};
