CREATE TABLE "institutions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_operation_id" uuid NOT NULL,
	"installment_number" smallint NOT NULL,
	"due_date" date NOT NULL,
	"expected_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expected_principal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expected_interest" numeric(12, 2) DEFAULT '0' NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0',
	"paid_principal" numeric(12, 2) DEFAULT '0',
	"paid_interest" numeric(12, 2) DEFAULT '0',
	"paid_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" text NOT NULL,
	"payer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" text NOT NULL,
	"loan_type" text NOT NULL,
	"principal_borrowed" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_received" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_contracted" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_interest" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_charge" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_payable" numeric(12, 2) DEFAULT '0' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_due_date" date NOT NULL,
	"current_installment" smallint DEFAULT 1 NOT NULL,
	"total_installments" smallint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"user_id" text NOT NULL,
	"payer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_operation_id" uuid NOT NULL,
	"installment_id" uuid,
	"installment_number" smallint NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"principal_paid" numeric(12, 2) DEFAULT '0',
	"interest_paid" numeric(12, 2) DEFAULT '0',
	"charge_paid" numeric(12, 2) DEFAULT '0',
	"paid_at" timestamp with time zone,
	"status" text DEFAULT 'paid' NOT NULL,
	"user_id" text NOT NULL,
	"payer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_loan_operation_id_loan_operations_id_fk" FOREIGN KEY ("loan_operation_id") REFERENCES "public"."loan_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_payer_id_pagadores_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."pagadores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_operations" ADD CONSTRAINT "loan_operations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_operations" ADD CONSTRAINT "loan_operations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_operations" ADD CONSTRAINT "loan_operations_payer_id_pagadores_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."pagadores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_loan_operation_id_loan_operations_id_fk" FOREIGN KEY ("loan_operation_id") REFERENCES "public"."loan_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_installment_id_loan_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."loan_installments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_payer_id_pagadores_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."pagadores"("id") ON DELETE set null ON UPDATE no action;