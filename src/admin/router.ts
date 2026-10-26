import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { runAdminChatTurn } from "../ai/adminChat";

export const adminRouter = Router();

function requireAdminToken(req: Request, res: Response): boolean {
  const token = req.header("x-admin-token");
  if (!token || token !== env.adminToken) {
    res.status(401).json({ error: "Token de administrador invalido ou ausente." });
    return false;
  }
  return true;
}

interface AdminChatRequestBody {
  message?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

// Chat interno para o administrador do laboratorio atualizar o banco de conhecimento
// (precos, preparo, exames, horario) por linguagem natural. Nao tem relacao com o
// webhook do WhatsApp — e uma ferramenta de bastidores, protegida por token.
adminRouter.post("/admin/chat", async (req: Request, res: Response) => {
  if (!requireAdminToken(req, res)) return;

  const body = req.body as AdminChatRequestBody;
  const message = body.message?.trim();
  if (!message) {
    res.status(400).json({ error: "Campo 'message' e obrigatorio." });
    return;
  }
  const history = Array.isArray(body.history) ? body.history : [];

  try {
    const reply = await runAdminChatTurn({ history, message });
    res.json({ reply });
  } catch (err) {
    console.error("Erro no chat de treinamento da IA:", err);
    res.status(500).json({ error: "Falha ao processar a mensagem." });
  }
});
