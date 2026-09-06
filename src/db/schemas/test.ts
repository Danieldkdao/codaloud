import { pgTable, varchar } from "drizzle-orm/pg-core";

export const testSchema = pgTable("test", {
  random: varchar("random"),
});
