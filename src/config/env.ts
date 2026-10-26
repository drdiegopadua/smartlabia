import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),

  databaseUrl: required("DATABASE_URL"),

  // "claude" (padrao, producao) ou "gemini" (testes sem custo, apenas com dados ficticios)
  llmProvider: (process.env.LLM_PROVIDER ?? "claude") as "claude" | "gemini",

  anthropicApiKey: process.env.LLM_PROVIDER === "gemini" ? (process.env.ANTHROPIC_API_KEY ?? "") : required("ANTHROPIC_API_KEY"),
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-5",

  gemini: {
    apiKey: process.env.LLM_PROVIDER === "gemini" ? required("GEMINI_API_KEY") : (process.env.GEMINI_API_KEY ?? ""),
    model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
    // Modelos reserva, usados se o principal estiver sobrecarregado ou indisponivel.
    fallbackModels: (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.7-flash,gemini-3.5-flash").split(",").map((m) => m.trim()).filter(Boolean),
    baseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
  },

  whatsapp: {
    token: required("WHATSAPP_TOKEN"),
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    verifyToken: required("WHATSAPP_VERIFY_TOKEN"),
    appSecret: required("WHATSAPP_APP_SECRET"),
  },

  lab: {
    name: process.env.LAB_NAME ?? "Laboratorio",
    tagline: process.env.LAB_TAGLINE ?? "Diagnostico de confianca",
    cityUf: process.env.LAB_CITY_UF ?? "",
    phone: process.env.LAB_PHONE ?? "",
    resultsUrl: process.env.LAB_RESULTS_URL ?? "",
    timezone: process.env.LAB_TIMEZONE ?? "America/Sao_Paulo",
  },

  discounts: {
    pixDebit: Number(process.env.DISCOUNT_PIX_DEBIT ?? 0.4),
    creditCard: Number(process.env.DISCOUNT_CREDIT_CARD ?? 0.35),
    maxInstallments: Number(process.env.MAX_INSTALLMENTS ?? 10),
  },

  followUp: {
    cron: process.env.FOLLOWUP_CRON ?? "0 * * * *",
    inactivityHours: Number(process.env.FOLLOWUP_INACTIVITY_HOURS ?? 24),
  },

  adminToken: required("ADMIN_API_TOKEN"),
};
