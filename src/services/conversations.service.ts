import { prisma } from "../db/prisma";
import { MessageDirection } from "@prisma/client";

export async function getOrCreateContact(phone: string, name?: string) {
  return prisma.contact.upsert({
    where: { phone },
    update: name ? { name } : {},
    create: { phone, name },
  });
}

export async function getOrCreateOpenConversation(contactId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { contactId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return prisma.conversation.create({ data: { contactId } });
}

export async function appendMessage(
  conversationId: string,
  direction: MessageDirection,
  role: "user" | "assistant" | "system",
  content: string,
  media?: { url?: string; type?: string }
) {
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction,
        role,
        content,
        mediaUrl: media?.url,
        mediaType: media?.type,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    }),
  ]);
}

export async function getRecentHistory(conversationId: string, limit = 20) {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return messages.reverse();
}
