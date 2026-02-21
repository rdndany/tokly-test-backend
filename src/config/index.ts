import dotenv from "dotenv";

dotenv.config();

const config = {
  port: process.env.PORT || 8000,
  nodeEnv: process.env.NODE_ENV || "development",

  database: {
    mongoURI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lovable",
  },

  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || "6379",
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || "0",
  },

  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY || "",
    webhookSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET || "",
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || "",
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
  },

  mobula: {
    apiKey: process.env.MOBULA_API_KEY || "",
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail:
      process.env.RESEND_FROM_EMAIL || "Lovable <onboarding@resend.dev>",
  },

  app: {
    url: process.env.APP_URL || process.env.FRONTEND_URL || "https://lovable.dev",
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },

  vercel: {
    apiToken: process.env.VERCEL_API_TOKEN || "",
    projectId: process.env.VERCEL_PROJECT_ID || "",
    teamId: process.env.VERCEL_TEAM_ID || null,
    apiUrl: "https://api.vercel.com",
  },
};

export default config;
