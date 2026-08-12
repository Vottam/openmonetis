--> statement-breakpoint
CREATE TABLE "accounts_payable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"description" text NOT NULL,
	"supplier_name" text NOT NULL,
	"category_id" uuid,
	"recurrence_type" text NOT NULL,
	"default_amount" numeric(12, 2),
	"due_day" smallint,
	"starts_at" date NOT NULL,
	"ends_at" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_category_id_categorias_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "accounts_payable_user_id_idx" ON "accounts_payable" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "accounts_payable_category_id_idx" ON "accounts_payable" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX "accounts_payable_status_idx" ON "accounts_payable" USING btree ("status");
--> statement-breakpoint
CREATE TABLE "accounts_payable_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payable_id" uuid NOT NULL,
	"period" text NOT NULL,
	"due_date" date NOT NULL,
	"expected_amount" numeric(12, 2),
	"actual_amount" numeric(12, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts_payable_occurrences" ADD CONSTRAINT "accounts_payable_occurrences_payable_id_accounts_payable_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."accounts_payable"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "accounts_payable_occurrences_payable_id_idx" ON "accounts_payable_occurrences" USING btree ("payable_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_payable_occurrences_payable_id_period_key" ON "accounts_payable_occurrences" USING btree ("payable_id", "period");
--> statement-breakpoint
CREATE INDEX "accounts_payable_occurrences_due_date_idx" ON "accounts_payable_occurrences" USING btree ("due_date");
--> statement-breakpoint
CREATE INDEX "accounts_payable_occurrences_status_idx" ON "accounts_payable_occurrences" USING btree ("status");