import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tripStates = sqliteTable("trip_states", {
  tripId: text("trip_id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
