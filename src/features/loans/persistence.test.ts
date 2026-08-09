import { beforeEach, describe, expect, it } from "vitest";
import { loanInstallments, loanOperations, loanPayments } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	createInstallmentAction,
	createLoanOperationAction,
	recordPaymentAction,
} from "./actions";
import { seedLoanTestData } from "./lib/test-support";
import { fetchLoanBalance, fetchLoanSummaryForUser } from "./queries";

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
});
