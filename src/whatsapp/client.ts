import { env } from "../config/env";

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

function authHeaders() {
  return {
    Authorization: `Bearer ${env.whatsapp.token}`,
    "Content-Type": "application/json",
  };
}

export async function sendTextMessage(to: string, body: string): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/${env.whatsapp.phoneNumberId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: true },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Falha ao enviar mensagem WhatsApp: ${res.status} ${errorBody}`);
  }
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  await fetch(`${GRAPH_BASE}/${env.whatsapp.phoneNumberId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
}

interface MediaMeta {
  url: string;
  mimeType: string;
}

export async function getMediaMeta(mediaId: string): Promise<MediaMeta> {
  const res = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.whatsapp.token}` },
  });
  if (!res.ok) {
    throw new Error(`Falha ao obter metadados de midia: ${res.status}`);
  }
  const data = (await res.json()) as { url: string; mime_type: string };
  return { url: data.url, mimeType: data.mime_type };
}

export async function downloadMedia(mediaId: string): Promise<{ base64: string; mimeType: string }> {
  const meta = await getMediaMeta(mediaId);
  const res = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.whatsapp.token}` },
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar midia: ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return { base64, mimeType: meta.mimeType };
}
