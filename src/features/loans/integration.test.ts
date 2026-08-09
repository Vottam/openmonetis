import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { loanInstallments, loanOperations } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	createInstallmentAction,
	createLoanOperationAction,
	recordPaymentAction,
} from "./actions";
import { seedLoanTestData } from "./lib/test-support";

function fixedLoanInput(institutionId: string) {
	return {
		institutionId,
		loanType: "fixed" as const,
		principalBorrowed: 5000,
		amountReceived: 5000,
		totalContracted: 5000,
		totalInterest: 500,
		totalCharge: 0,
		totalPayable: 5500,
		startDate: new Date("2025-01-01T00:00:00.000Z"),
		endDate: null,
		nextDueDate: new Date("2025-02-01T00:00:00.000Z"),
		currentInstallment: 1,
		totalInstallments: 2,
		status: "active" as const,
	};
}

describe("integração de loans", () => {
	beforeEach(async () => {
		await seedLoanTestData();
	});

	it("reduz a dívida de empréstimo fixo sem transformar amortização em limite reutilizável", async () => {
		const { institutionId } = await seedLoanTestData();

		const operation = await createLoanOperationAction(
			fixedLoanInput(institutionId),
		);
		const installment = await createInstallmentAction({
			loanOperationId: operation.loanOperationId,
			installmentNumber: 1,
			dueDate: new Date("2025-02-15T00:00:00.000Z"),
			expectedValue: 2500,
			expectedPrincipal: 2000,
			expectedInterest: 500,
			status: "pending",
		});

		const payment = await recordPaymentAction({
			installmentId: installment.installmentId,
			amount: 2500,
			principalPaid: 2000,
			interestPaid: 500,
			chargePaid: 0,
			paidAt: new Date("2025-02-15T00:00:00.000Z"),
			status: "paid",
		});

		expect(payment.success).toBe(true);

		if (!operation.loanOperationId) {
			throw new Error("loanOperationId ausente");
		}
		if (!installment.installmentId) {
			throw new Error("installmentId ausente");
		}

		const [storedOperation] = await db
			.select()
			.from(loanOperations)
			.where(eq(loanOperations.id, operation.loanOperationId));

		const [storedInstallment] = await db
			.select()
			.from(loanInstallments)
			.where(eq(loanInstallments.id, installment.installmentId));

		expect(Number(storedOperation.principalBorrowed)).toBe(5000);
		expect(Number(storedOperation.totalContracted)).toBe(5000);
		expect(Number(storedInstallment.paidAmount)).toBe(2500);
		expect(storedInstallment.status).toBe("paid");
	});
});
