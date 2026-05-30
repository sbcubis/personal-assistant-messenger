import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, assistants, assistantMessages } from "@workspace/db";
import { SendOpenaiMessageParams, SendOpenaiMessageBody, SendOpenaiVoiceMessageParams, SendOpenaiVoiceMessageBody } from "@workspace/api-zod";
import OpenAI, { toFile } from "openai";
import { ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const router: IRouter = Router();

// POST /openai/conversations/:id/messages  (text chat, SSE streaming)
router.post("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendOpenaiMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendOpenaiMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const assistantId = params.data.id;
  const [assistant] = await db.select().from(assistants).where(eq(assistants.id, assistantId));
  if (!assistant) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }

  // Save user message
  await db.insert(assistantMessages).values({
    assistantId,
    role: "user",
    content: body.data.content,
  });

  // Fetch conversation history
  const history = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.assistantId, assistantId))
    .orderBy(asc(assistantMessages.createdAt));

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    ...(assistant.instructions
      ? [{ role: "system" as const, content: assistant.instructions }]
      : [{ role: "system" as const, content: "You are a helpful AI assistant." }]),
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 8192,
    messages: chatMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  // Save assistant message
  await db.insert(assistantMessages).values({
    assistantId,
    role: "assistant",
    content: fullResponse,
  });

  // Update assistant updatedAt
  await db.update(assistants).set({ updatedAt: new Date() }).where(eq(assistants.id, assistantId));

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

// POST /openai/conversations/:id/voice-messages  (voice, SSE streaming)
router.post("/openai/conversations/:id/voice-messages", async (req, res): Promise<void> => {
  const params = SendOpenaiVoiceMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendOpenaiVoiceMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const assistantId = params.data.id;
  const [assistant] = await db.select().from(assistants).where(eq(assistants.id, assistantId));
  if (!assistant) {
    res.status(404).json({ error: "Assistant not found" });
    return;
  }

  const audioBuffer = Buffer.from(body.data.audio, "base64");
  const { buffer: compatBuffer, format } = await ensureCompatibleFormat(audioBuffer);

  // Transcribe user audio
  const transcription = await openai.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file: await toFile(compatBuffer, `audio.${format}`, { type: `audio/${format}` }),
    response_format: "json",
  });
  const userTranscript = transcription.text;

  // Save user message
  await db.insert(assistantMessages).values({
    assistantId,
    role: "user",
    content: userTranscript,
  });

  // Fetch conversation history
  const history = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.assistantId, assistantId))
    .orderBy(asc(assistantMessages.createdAt));

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    ...(assistant.instructions
      ? [{ role: "system" as const, content: assistant.instructions }]
      : [{ role: "system" as const, content: "You are a helpful AI assistant." }]),
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Stream text response
  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 8192,
    messages: chatMessages,
    stream: true,
  });

  let fullResponse = "";
  res.write(`data: ${JSON.stringify({ type: "transcript", data: userTranscript, role: "user" })}\n\n`);

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ type: "transcript", data: content, role: "assistant" })}\n\n`);
    }
  }

  // Save assistant message
  await db.insert(assistantMessages).values({
    assistantId,
    role: "assistant",
    content: fullResponse,
  });

  await db.update(assistants).set({ updatedAt: new Date() }).where(eq(assistants.id, assistantId));

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
