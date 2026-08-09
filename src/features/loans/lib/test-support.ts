import { randomUUID } from "node:crypto";

import { institutions, payers, user } from "@/db/schema";
import { db } from "@/shared/lib/db";

function createLoanSeedData() {
	const suffix = randomUUID();

	return {
		user: {
			id: `loan-test-user-${suffix}`,
			name: "Loan Test User",
			email: `loan-test-${suffix}@example.com`,
			emailVerified: true,
			image: null,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: new Date("2025-01-01T00:00:00.000Z"),
		},
		payerId: randomUUID(),
		institutionId: `loan-institution-${suffix}`,
		shareCode: `loan-test-share-code-${suffix}`,
	};
}

export async function resetLoanTestData() {
	await db.execute(
		`TRUNCATE TABLE "loan_payments", "loan_installments", "loan_operations", "institutions", "pagadores", "user" RESTART IDENTITY CASCADE`,
	);
}

export async function seedLoanTestData() {
	const seed = createLoanSeedData();
	const loanTestContext = globalThis as { __loanTestUser?: typeof seed.user };
	loanTestContext.__loanTestUser = seed.user;

	await db.insert(user).values(seed.user);

	await db.insert(payers).values({
		id: seed.payerId,
		name: "Pessoa Teste",
		email: null,
		avatarUrl: null,
		status: "active",
		note: null,
		role: "admin",
		isAutoSend: false,
		shareCode: seed.shareCode,
		lastMailAt: null,
		userId: seed.user.id,
	});

	await db.insert(institutions).values({
		id: seed.institutionId,
		name: "Banco Teste",
		type: "bank",
		description: "Instituição de teste",
		userId: seed.user.id,
	});

	return {
		userId: seed.user.id,
		payerId: seed.payerId,
		institutionId: seed.institutionId,
	};
}
