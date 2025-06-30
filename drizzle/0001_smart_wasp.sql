CREATE TABLE IF NOT EXISTS "issue_assignee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"assignee_id" text,
	"state_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue" DROP CONSTRAINT "issue_state_id_issue_state_id_fk";
--> statement-breakpoint
ALTER TABLE "issue" DROP CONSTRAINT "issue_assignee_id_user_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issue_assignee_issue_idx" ON "issue_assignee" ("issue_id","assignee_id");--> statement-breakpoint
ALTER TABLE "issue" DROP COLUMN IF EXISTS "state_id";--> statement-breakpoint
ALTER TABLE "issue" DROP COLUMN IF EXISTS "assignee_id";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_assignee" ADD CONSTRAINT "issue_assignee_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "issue"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_assignee" ADD CONSTRAINT "issue_assignee_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_assignee" ADD CONSTRAINT "issue_assignee_state_id_issue_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "issue_state"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
