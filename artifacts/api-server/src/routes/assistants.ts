import { Router, type IRouter } from "express";
import { eq, desc, sql, ilike, or } from "drizzle-orm";
import { db, assistants, assistantMessages } from "@workspace/db";
import {
  CreateAssistantBody,
  UpdateAssistantBody,
  GetAssistantParams,
  UpdateAssistantParams,
  DeleteAssistantParams,
  ToggleAssistantPinParams,
  ToggleAssistantArchiveParams,
  DuplicateAssistantParams,
  GenerateAssistantAvatarParams,
  GenerateAssistantAvatarBody,
  SearchAssistantsQueryParams,
  ListMessagesParams,
  ClearMessagesParams,
} from "@workspace/api-zod";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(s, 10);
}

// Build assistant response shape with message count and last message info
async function getAssistantWithMeta(id: number) {
  const [assistant] = await db.select().from(assistants).where(eq(assistants.id, id));
  if (!assistant) return null;

  const msgs = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.assistantId, id))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(1);

  const lastMsg = msgs[0];
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assistantMessages)
    .where(eq(assistantMessages.assistantId, id));

  return {
    ...assistant,
    messageCount: count,
    lastMessageAt: lastMsg?.createdAt ?? null,
    lastMessagePreview: lastMsg?.content?.slice(0, 100) ?? null,
  };
}

// GET /assistants
router.get("/assistants", async (_req, res): Promise<void> => {
  const all = await db.select().from(assistants).orderBy(desc(assistants.isPinned), desc(assistants.createdAt));

  const withMeta = await Promise.all(all.map((a) => getAssistantWithMeta(a.id)));
  res.json(withMeta.filter(Boolean));
});

// POST /assistants
router.post("/assistants", async (req, res): Promise<void> => {
  const parsed = CreateAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db.insert(assistants).values(parsed.data).returning();
  const withMeta = await getAssistantWithMeta(created.id);
  res.status(201).json(withMeta);
});

// GET /assistants/search  — must be before /assistants/:id
router.get("/assistants/search", async (req, res): Promise<void> => {
  const parsed = SearchAssistantsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q } = parsed.data;
  const matchedAssistants = await db
    .select()
    .from(assistants)
    .where(ilike(assistants.name, `%${q}%`))
    .orderBy(desc(assistants.createdAt));

  const withMeta = await Promise.all(matchedAssistants.map((a) => getAssistantWithMeta(a.id)));

  const matchedMessages = await db
    .select({
      id: assistantMessages.id,
      assistantId: assistantMessages.assistantId,
      assistantName: assistants.name,
      role: assistantMessages.role,
      content: assistantMessages.content,
      createdAt: assistantMessages.createdAt,
    })
    .from(assistantMessages)
    .innerJoin(assistants, eq(assistantMessages.assistantId, assistants.id))
    .where(ilike(assistantMessages.content, `%${q}%`))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(50);

  res.json({ assistants: withMeta.filter(Boolean), messages: matchedMessages });
});

// GET /assistants/:id
router.get("/assistants/:id", async (req, res): Promise<void> => {
  const params = GetAssistantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const withMeta = await getAssistantWithMeta(params.data.id);
  if (!withMeta) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  res.json(withMeta);
});

// PATCH /assistants/:id
router.patch("/assistants/:id", async (req, res): Promise<void> => {
  const params = UpdateAssistantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(assistants)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(assistants.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  const withMeta = await getAssistantWithMeta(updated.id);
  res.json(withMeta);
});

// DELETE /assistants/:id
router.delete("/assistants/:id", async (req, res): Promise<void> => {
  const params = DeleteAssistantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(assistants).where(eq(assistants.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  res.sendStatus(204);
});

// PATCH /assistants/:id/pin
router.patch("/assistants/:id/pin", async (req, res): Promise<void> => {
  const params = ToggleAssistantPinParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [current] = await db.select().from(assistants).where(eq(assistants.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  await db
    .update(assistants)
    .set({ isPinned: !current.isPinned, updatedAt: new Date() })
    .where(eq(assistants.id, params.data.id));
  const withMeta = await getAssistantWithMeta(params.data.id);
  res.json(withMeta);
});

// PATCH /assistants/:id/archive
router.patch("/assistants/:id/archive", async (req, res): Promise<void> => {
  const params = ToggleAssistantArchiveParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [current] = await db.select().from(assistants).where(eq(assistants.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  await db
    .update(assistants)
    .set({ isArchived: !current.isArchived, updatedAt: new Date() })
    .where(eq(assistants.id, params.data.id));
  const withMeta = await getAssistantWithMeta(params.data.id);
  res.json(withMeta);
});

// POST /assistants/:id/duplicate
router.post("/assistants/:id/duplicate", async (req, res): Promise<void> => {
  const params = DuplicateAssistantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [original] = await db.select().from(assistants).where(eq(assistants.id, params.data.id));
  if (!original) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }
  const [created] = await db
    .insert(assistants)
    .values({
      name: `${original.name} (copy)`,
      instructions: original.instructions,
      avatarEmoji: original.avatarEmoji,
      avatarUrl: original.avatarUrl,
    })
    .returning();
  const withMeta = await getAssistantWithMeta(created.id);
  res.status(201).json(withMeta);
});

// POST /assistants/:id/generate-avatar
router.post("/assistants/:id/generate-avatar", async (req, res): Promise<void> => {
  const params = GenerateAssistantAvatarParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = GenerateAssistantAvatarBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const buffer = await generateImageBuffer(parsed.data.prompt, "1024x1024");
  res.json({ b64_json: buffer.toString("base64") });
});

// GET /assistants/:id/messages
router.get("/assistants/:id/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const msgs = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.assistantId, params.data.id))
    .orderBy(assistantMessages.createdAt);
  res.json(msgs.map((m) => ({ ...m, assistantId: m.assistantId })));
});

// DELETE /assistants/:id/messages (clear)
router.delete("/assistants/:id/messages", async (req, res): Promise<void> => {
  const params = ClearMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(assistantMessages).where(eq(assistantMessages.assistantId, params.data.id));
  res.sendStatus(204);
});

export default router;
