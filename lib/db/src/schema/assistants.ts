import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assistants = pgTable("assistants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  instructions: text("instructions"),
  avatarEmoji: text("avatar_emoji"),
  avatarUrl: text("avatar_url"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  provider: text("provider").notNull().default("openai"), // "openai" | "charlotte"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAssistantSchema = createInsertSchema(assistants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAssistant = z.infer<typeof insertAssistantSchema>;
export type Assistant = typeof assistants.$inferSelect;
