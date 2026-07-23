import express from "express";
import { env } from "./config/env";
import { webhookRouter } from "./whatsapp/webhook";
import { startFollowUpJob } from "./jobs/followup.job";

const app = express();

// Guarda o corpo bruto da requisicao para validar a assinatura HMAC do webhook da Meta
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/", webhookRouter);

app.listen(env.port, () => {
  console.log(`SmartLabIA rodando na porta ${env.port}`);
  startFollowUpJob();
});
