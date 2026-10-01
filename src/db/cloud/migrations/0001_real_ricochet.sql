CREATE TYPE "public"."billing_tier" AS ENUM('free', 'tier_1', 'tier_2');--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tier" "billing_tier" DEFAULT 'free' NOT NULL,
	"monthly_credits" integer DEFAULT 50 NOT NULL,
	"purchased_credits" integer DEFAULT 0 NOT NULL,
	"monthly_allowance" integer DEFAULT 50 NOT NULL,
	"account_anchor" timestamp with time zone NOT NULL,
	"cycle_anchor" timestamp with time zone NOT NULL,
	"cycle_index" integer DEFAULT 0 NOT NULL,
	"trial_used_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"paid_through" timestamp with time zone,
	"product_id" text,
	"purchase_date" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"monthly_delta" integer DEFAULT 0 NOT NULL,
	"purchased_delta" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_entries_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_entries_user_created_idx" ON "credit_entries" USING btree ("user_id","created_at");