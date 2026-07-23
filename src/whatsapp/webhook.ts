import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { sendTextMessage, markMessageAsRead, downloadMedia } from "./client";
import { getOrCreateContact, getOrCreateOpenConversation, appendMessage, getRecentHistory } from "../services/conversations.service";
import { runConversationTurn } from "../ai/claude";
import { verifyWhatsAppSignature } from "./verifySignature";

export const webhookRouter = Router();

// Verificacao do webhook exigida pela Meta na configuracao do app
webhookRouter.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.whatsapp.verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

interface WhatsAppMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename?: string };
}

webhookRouter.post("/webhook", verifyWhatsAppSignature, async (req: Request, res: Response) => {
  // Responde 200 imediatamente para a Meta nao reenviar o evento
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages: WhatsAppMessage[] = value?.messages ?? [];
    const contactName: string | undefined = value?.contacts?.[0]?.profile?.name;

    for (const message of messages) {
      await handleIncomingMessage(message, contactName);
    }
  } catch (err) {
    console.error("Erro ao processar webhook do WhatsApp:", err);
  }
});

async function handleIncomingMessage(message: WhatsAppMessage, contactName?: string) {
  await markMessageAsRead(message.id).catch(() => undefined);

  const contact = await getOrCreateContact(message.from, contactName);
  const conversation = await getOrCreateOpenConversation(contact.id);

  const userParts: Array<{ type: "text" | "image" | "document"; text?: string; base64?: string; mimeType?: string }> = [];
  let loggedContent = "";
  let mediaType: string | undefined;

  if (message.type === "text" && message.text) {
    userParts.push({ type: "text", text: message.text.body });
    loggedContent = message.text.body;
  } else if (message.type === "image" && message.image) {
    const media = await downloadMedia(message.image.id);
    userParts.push({ type: "image", base64: media.base64, mimeType: media.mimeType });
    userParts.push({ type: "text", text: "O cliente enviou uma imagem, possivelmente um pedido medico. Extraia os exames e monte o orcamento." });
    loggedContent = "[imagem recebida]";
    mediaType = "image";
  } else if (message.type === "document" && message.document) {
    const media = await downloadMedia(message.document.id);
    userParts.push({ type: "document", base64: media.base64, mimeType: media.mimeType });
    userParts.push({ type: "text", text: "O cliente enviou um PDF, possivelmente um pedido medico. Extraia os exames e monte o orcamento." });
    loggedContent = `[documento recebido: ${message.document.filename ?? "arquivo.pdf"}]`;
    mediaType = "document";
  } else {
    await sendTextMessage(message.from, "No momento consigo atender por texto, foto ou PDF do pedido medico. Pode reenviar assim?");
    return;
  }

  await appendMessage(conversation.id, "INBOUND", "user", loggedContent, mediaType ? { type: mediaType } : undefined);

  const history = await getRecentHistory(conversation.id, 20);
  const historyForAi = history
    .slice(0, -1) // exclui a mensagem que acabamos de salvar, ja enviada via userParts
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const reply = await runConversationTurn({
    history: historyForAi,
    newUserParts: userParts,
    contactId: contact.id,
  });

  await sendTextMessage(message.from, reply);
  await appendMessage(conversation.id, "OUTBOUND", "assistant", reply);
}
