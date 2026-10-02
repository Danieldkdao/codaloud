CREATE TABLE "credit_topups" (
	"key" text PRIMARY KEY NOT NULL,
	"event_id" text,
	"user_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"refunded_at" timestamp with time zone,
	CONSTRAINT "credit_topups_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "credit_topups" ADD CONSTRAINT "credit_topups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_topups_user_idx" ON "credit_topups" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "credit_topups" ("key", "event_id", "user_id", "credits")
SELECT 'legacy:' || substring("key" from 12), substring("key" from 12), "user_id", "purchased_delta"
FROM "credit_entries"
WHERE "kind" = 'topup' AND "key" LIKE 'revenuecat:%' AND "purchased_delta" > 0;
