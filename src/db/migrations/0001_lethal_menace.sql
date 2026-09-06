CREATE TYPE "public"."project_setup_statuses" AS ENUM('pending', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sandbox_id" text,
	"setup_status" "project_setup_statuses" DEFAULT 'pending' NOT NULL,
	"setup_error" text,
	"github_repository_id" text,
	"last_opened_file_path" text,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_sandbox_id_unique" UNIQUE("sandbox_id"),
	CONSTRAINT "projects_name_not_blank" CHECK (length(btrim("projects"."name")) > 0),
	CONSTRAINT "projects_ready_has_sandbox" CHECK ("projects"."setup_status" <> 'ready' OR "projects"."sandbox_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_user_id_updated_at_idx" ON "projects" USING btree ("user_id","updated_at" DESC NULLS LAST);