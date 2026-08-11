import { beforeEach, describe, expect, it } from "vitest";
import { loanInstallments, loanOperations, loanPayments } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	createInstallmentAction,
	createLoanOperationAction,
	recordPaymentAction,
} from "./actions";
import {
	buildLoanDashboardData,
	buildLoanInstallmentPlan,
} from "./lib/dashboard";
import { seedLoanTestData } from "./lib/test-support";
import {
	fetchInstitutionsForUser,
	fetchLoanAccountDetails,
	fetchLoanBalance,
	fetchLoanSummaryForUser,
} from "./queries";

function fixedOperationInput(institutionId: string) {
	return {
		institutionId,
		loanType: "fixed" as const,
		principalBorrowed: 2000,
		amountReceived: 2000,
		totalContracted: 10000,
		totalInterest: 1000,
		totalCharge: 0,
		totalPayable: 3000,
		startDate: new Date("2025-01-01T00:00:00.000Z"),
		endDate: null,
		nextDueDate: new Date("2025-02-01T00:00:00.000Z"),
		currentInstallment: 1,
		totalInstallments: 12,
		status: "active" as const,
	};
}

function operationInput(institutionId: string) {
	return {
		institutionId,
		loanType: "revolving" as const,
		principalBorrowed: 5000,
		amountReceived: 5000,
		totalContracted: 5000,
		totalInterest: 0,
		totalCharge: 0,
		totalPayable: 5000,
		startDate: new Date("2025-01-01T00:00:00.000Z"),
		endDate: null,
		nextDueDate: new Date("2025-02-01T00:00:00.000Z"),
		currentInstallment: 1,
		totalInstallments: 2,
		status: "active" as const,
	};
}

describe("persistência end-to-end de loans", () => {
	beforeEach(async () => {
		await seedLoanTestData();
	});

	it("cria operação, parcela, registra pagamento e reflete agregados no banco", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		const operation = await createLoanOperationAction(
			operationInput(institutionId),
		);
		expect(operation.success).toBe(true);

		const installment = await createInstallmentAction({
			loanOperationId: operation.loanOperationId,
			installmentNumber: 1,
			dueDate: new Date("2025-02-15T00:00:00.000Z"),
			expectedValue: 2500,
			expectedPrincipal: 2500,
			expectedInterest: 0,
			status: "pending",
		});

		const payment = await recordPaymentAction({
			installmentId: installment.installmentId,
			amount: 2500,
			principalPaid: 2500,
			interestPaid: 0,
			chargePaid: 0,
			paidAt: new Date("2025-02-15T00:00:00.000Z"),
			status: "paid",
		});

		expect(payment.success).toBe(true);

		const [operationRow] = await db.select().from(loanOperations);
		const [installmentRow] = await db.select().from(loanInstallments);
		const [paymentRow] = await db.select().from(loanPayments);

		expect(operationRow).toBeDefined();
		expect(installmentRow).toBeDefined();
		expect(paymentRow).toBeDefined();

		const balance = await fetchLoanBalance(userId, institutionId);
		const summaries = await fetchLoanSummaryForUser(userId);

		expect(Number(balance?.utilized)).toBe(5000);
		expect(Number(balance?.available)).toBe(0);
		expect(summaries).toHaveLength(1);
		expect(Number(summaries[0].available)).toBe(0);
	});

	it("atualiza o snapshot fixo após o terceiro pagamento sem manter valores antigos", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		const operation = await createLoanOperationAction(
			fixedOperationInput(institutionId),
		);
		expect(operation.success).toBe(true);
		const loanOperationId = operation.loanOperationId;
		expect(loanOperationId).toBeDefined();

		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-02-01T00:00:00.000Z"),
		});

		const createdInstallments: string[] = [];
		for (const draft of plan) {
			const created = await createInstallmentAction({
				loanOperationId: loanOperationId as string,
				installmentNumber: draft.installmentNumber,
				dueDate: draft.dueDate,
				expectedValue: draft.expectedValue,
				expectedPrincipal: draft.expectedPrincipal,
				expectedInterest: draft.expectedInterest,
				status: "pending",
			});
			expect(created.success).toBe(true);
			createdInstallments.push(created.installmentId as string);
		}

		for (const installmentId of createdInstallments.slice(0, 2)) {
			const payment = await recordPaymentAction({
				installmentId,
				amount: 250,
				principalPaid: 166.67,
				interestPaid: 83.33,
				chargePaid: 0,
				paidAt: new Date("2025-02-15T00:00:00.000Z"),
				status: "paid",
			});
			expect(payment.success).toBe(true);
		}

		const institutionsBefore = await fetchInstitutionsForUser(userId);
		const loanDataBefore = await fetchLoanAccountDetails(userId, [
			institutionId,
		]);
		const dashboardBefore = buildLoanDashboardData({
			institutions: institutionsBefore,
			operations: loanDataBefore.operations,
			installments: loanDataBefore.installments,
			payments: loanDataBefore.payments,
		});
		const fixedBefore = dashboardBefore.accounts.find(
			(account) =>
				account.loanType === "fixed" && account.institutionId === institutionId,
		);

		expect(Number(fixedBefore?.summary.totalPaid)).toBe(500);
		expect(Number(fixedBefore?.summary.remainingPrincipal)).toBe(1666.66);
		expect(Number(fixedBefore?.summary.remainingInterest)).toBe(833.34);

		const thirdPayment = await recordPaymentAction({
			installmentId: createdInstallments[2],
			amount: 250,
			principalPaid: 166.67,
			interestPaid: 83.33,
			chargePaid: 0,
			paidAt: new Date("2025-02-15T00:00:00.000Z"),
			status: "paid",
		});
		expect(thirdPayment.success).toBe(true);

		const institutionsAfter = await fetchInstitutionsForUser(userId);
		const loanDataAfter = await fetchLoanAccountDetails(userId, [
			institutionId,
		]);
		const dashboardAfter = buildLoanDashboardData({
			institutions: institutionsAfter,
			operations: loanDataAfter.operations,
			installments: loanDataAfter.installments,
			payments: loanDataAfter.payments,
		});
		const fixedAfter = dashboardAfter.accounts.find(
			(account) =>
				account.loanType === "fixed" && account.institutionId === institutionId,
		);

		expect(Number(fixedAfter?.summary.totalPaid)).toBe(750);
		expect(Number(fixedAfter?.summary.remainingPrincipal)).toBe(1499.99);
		expect(Number(fixedAfter?.summary.remainingInterest)).toBe(750.01);
	});
});
