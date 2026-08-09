import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";
import { institutions, loanOperations, payers, user } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { seedLoanTestData } from "./lib/test-support";
import { fetchLoanBalance, fetchLoanSummaryForUser } from "./queries";

function loanDates() {
	return {
		startDate: "2025-01-01",
		nextDueDate: "2025-02-01",
	};
}

async function insertLoanOperation(params: {
	userId: string;
	institutionId: string;
	principalBorrowed: number;
	totalContracted: number;
	totalInterest: number;
	totalCharge: number;
	totalPayable: number;
	loanType?: "revolving" | "fixed";
}) {
	const inserted = await db
		.insert(loanOperations)
		.values({
			institutionId: params.institutionId,
			loanType: params.loanType ?? "revolving",
			principalBorrowed: formatDecimalForDbRequired(params.principalBorrowed),
			amountReceived: formatDecimalForDbRequired(params.principalBorrowed),
			totalContracted: formatDecimalForDbRequired(params.totalContracted),
			totalInterest: formatDecimalForDbRequired(params.totalInterest),
			totalCharge: formatDecimalForDbRequired(params.totalCharge),
			totalPayable: formatDecimalForDbRequired(params.totalPayable),
			startDate: loanDates().startDate,
			endDate: null,
			nextDueDate: loanDates().nextDueDate,
			currentInstallment: 1,
			totalInstallments: 12,
			status: "active",
			userId: params.userId,
		})
		.returning({ id: loanOperations.id });

	return inserted[0].id;
}

describe("consultas financeiras de loans", () => {
	beforeEach(async () => {
		await seedLoanTestData();
	});

	it("mantém o limite disponível do rotativo e ignora juros na recomposição do limite", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		await insertLoanOperation({
			userId,
			institutionId,
			principalBorrowed: 2000,
			totalContracted: 10000,
			totalInterest: 50,
			totalCharge: 0,
			totalPayable: 2050,
			loanType: "revolving",
		});

		const balance = await fetchLoanBalance(userId, institutionId);

		expect(balance).not.toBeNull();
		expect(Number(balance?.limit)).toBe(10000);
		expect(Number(balance?.utilized)).toBe(2000);
		expect(Number(balance?.available)).toBe(8000);
		expect(Number(balance?.remainingInterest)).toBe(50);
	});

	it("agrega múltiplas operações do mesmo rotativo sem reutilizar juros", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		await insertLoanOperation({
			userId,
			institutionId,
			principalBorrowed: 1500,
			totalContracted: 5000,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 1500,
			loanType: "revolving",
		});

		await insertLoanOperation({
			userId,
			institutionId,
			principalBorrowed: 2000,
			totalContracted: 5000,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 2000,
			loanType: "revolving",
		});

		const balance = await fetchLoanBalance(userId, institutionId);

		expect(balance).not.toBeNull();
		expect(Number(balance?.limit)).toBe(10000);
		expect(Number(balance?.utilized)).toBe(3500);
		expect(Number(balance?.available)).toBe(6500);
		expect(Number(balance?.activeOperations)).toBe(2);
	});

	it("mantém isolamento entre usuários", async () => {
		const { userId: userA, institutionId: institutionA } =
			await seedLoanTestData();
		const suffix = randomUUID();
		const userB = `loan-test-user-b-${suffix}`;
		const institutionB = `loan-institution-test-b-${suffix}`;
		const payerB = randomUUID();

		await db.insert(user).values({
			id: userB,
			name: "Loan Test User B",
			email: `loan-test-b-${suffix}@example.com`,
			emailVerified: true,
			image: null,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: new Date("2025-01-01T00:00:00.000Z"),
		});

		await db.insert(payers).values({
			id: payerB,
			name: "Pessoa B",
			email: null,
			avatarUrl: null,
			status: "active",
			note: null,
			role: "admin",
			isAutoSend: false,
			shareCode: `loan-test-share-code-b-${suffix}`,
			lastMailAt: null,
			userId: userB,
		});

		await db.insert(institutions).values({
			id: institutionB,
			name: "Banco Teste B",
			type: "bank",
			description: null,
			userId: userB,
		});

		await insertLoanOperation({
			userId: userA,
			institutionId: institutionA,
			principalBorrowed: 1000,
			totalContracted: 1000,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 1000,
			loanType: "revolving",
		});

		await db.insert(loanOperations).values({
			institutionId: institutionB,
			loanType: "revolving",
			principalBorrowed: formatDecimalForDbRequired(4000),
			amountReceived: formatDecimalForDbRequired(4000),
			totalContracted: formatDecimalForDbRequired(4000),
			totalInterest: formatDecimalForDbRequired(0),
			totalCharge: formatDecimalForDbRequired(0),
			totalPayable: formatDecimalForDbRequired(4000),
			startDate: "2025-01-01",
			endDate: null,
			nextDueDate: "2025-02-01",
			currentInstallment: 1,
			totalInstallments: 12,
			status: "active",
			userId: userB,
		});

		const summaryA = await fetchLoanSummaryForUser(userA);
		const balanceA = await fetchLoanBalance(userA, institutionA);

		expect(summaryA).toHaveLength(1);
		expect(Number(balanceA?.available)).toBe(0);
		expect(Number(balanceA?.utilized)).toBe(1000);
	});

	it("preserva precisão monetária em centavos", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		await insertLoanOperation({
			userId,
			institutionId,
			principalBorrowed: 1234.56,
			totalContracted: 2000.1,
			totalInterest: 12.34,
			totalCharge: 0.56,
			totalPayable: 1247.46,
			loanType: "revolving",
		});

		const balance = await fetchLoanBalance(userId, institutionId);

		expect(Number(balance?.limit)).toBeCloseTo(2000.1, 2);
		expect(Number(balance?.utilized)).toBeCloseTo(1234.56, 2);
		expect(Number(balance?.available)).toBeCloseTo(765.54, 2);
	});
});
