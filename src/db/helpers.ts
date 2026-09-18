import { text } from "drizzle-orm/sqlite-core";

export const id = text("id").primaryKey();
export const createdAt = text("created_at").notNull();
export const updatedAt = text("updated_at").notNull();
