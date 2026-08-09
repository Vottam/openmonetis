import { institutions, payers, user } from "@/db/schema";
import { db } from "@/shared/lib/db";

export const LOAN_TEST_USER = {
	id: "loan-test-user",
	name: "Loan Test User",
	email: "loan-test@example.com",
	emailVerified: true,
	image: null,
	createdAt: new Date("2025-01-01T00:00:00.000Z"),
	updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

export const LOAN_TEST_PAYER_ID = "11111111-1111-4111-8111-111111111111";
export const LOAN_TEST_INSTITUTION_ID = "loan-institution-test";

export async function resetLoanTestData() {
	await db.execute(
		`TRUNCATE TABLE "loan_payments", "loan_installments", "loan_operations", "institutions", "pagadores", "user" RESTART IDENTITY CASCADE`,
	);
}

export async function seedLoanTestData() {
	await resetLoanTestData();

	await db.insert(user).values(LOAN_TEST_USER);

	await db.insert(payers).values({
		id: LOAN_TEST_PAYER_ID,
		name: "Pessoa Teste",
		email: null,
		avatarUrl: null,
		status: "active",
		note: null,
		role: "admin",
		isAutoSend: false,
		shareCode: "loan-test-share-code",
		lastMailAt: null,
		userId: LOAN_TEST_USER.id,
	});

	await db.insert(institutions).values({
		id: LOAN_TEST_INSTITUTION_ID,
		name: "Banco Teste",
		type: "bank",
		description: "Instituição de teste",
		userId: LOAN_TEST_USER.id,
	});

	return {
		userId: LOAN_TEST_USER.id,
		payerId: LOAN_TEST_PAYER_ID,
		institutionId: LOAN_TEST_INSTITUTION_ID,
	};
}
