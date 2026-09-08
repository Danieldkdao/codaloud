CREATE TYPE "public"."project_operation_kinds" AS ENUM('prepare', 'resume', 'delete');--> statement-breakpoint
CREATE TYPE "public"."project_operation_phases" AS ENUM('queued', 'creating-sandbox', 'starting-sandbox', 'preparing-files', 'deleting-sandbox', 'complete');--> statement-breakpoint
CREATE TYPE "public"."project_operation_statuses" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "project_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "project_operation_kinds" NOT NULL,
	"status" "project_operation_statuses" DEFAULT 'queued' NOT NULL,
	"phase" "project_operation_phases" DEFAULT 'queued' NOT NULL,
	"trigger_run_id" text,
	"github_account_id" uuid,
	"error_code" text,
	"error_message" text,
	"next_dispatch_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatch_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "project_operations_dispatch_attempts_nonnegative" CHECK ("project_operations"."dispatch_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "project_operations" ADD CONSTRAINT "project_operations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_operations" ADD CONSTRAINT "project_operations_github_account_id_account_id_fk" FOREIGN KEY ("github_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_operations_project_id_created_at_idx" ON "project_operations" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "project_operations_user_id_idx" ON "project_operations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_operations_status_next_dispatch_at_idx" ON "project_operations" USING btree ("status","next_dispatch_at");