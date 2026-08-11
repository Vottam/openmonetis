import { describe, expect, it } from "vitest";
import { buildLoanInstallmentPlan } from "./dashboard";
import { allocatePaymentComponents } from "./payment-allocation";

function cents(value: number) {
	return Math.round(value * 100);
}

describe("allocatePaymentComponents", () => {
	it("fecha exatamente todas as parcelas quando o pagamento é integral", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01T00:00:00.000Z"),
		});

		for (const installment of plan) {
			const allocation = allocatePaymentComponents({
				amount: installment.expectedValue,
				remainingPrincipal: installment.expectedPrincipal,
				remainingInterest: installment.expectedInterest,
				remainingCharge: installment.expectedCharge,
			});

			expect(cents(allocation.amount)).toBe(cents(installment.expectedValue));
			expect(cents(allocation.principalPaid)).toBe(
				cents(installment.expectedPrincipal),
			);
			expect(cents(allocation.interestPaid)).toBe(
				cents(installment.expectedInterest),
			);
			expect(cents(allocation.chargePaid)).toBe(
				cents(installment.expectedCharge),
			);
			expect(
				cents(
					allocation.principalPaid +
						allocation.interestPaid +
						allocation.chargePaid,
				),
			).toBe(cents(allocation.amount));
		}
	});

	it("aloca um pagamento parcial de 100.01 sem perder centavos", () => {
		const allocation = allocatePaymentComponents({
			amount: 100.01,
			remainingPrincipal: 166.67,
			remainingInterest: 83.33,
			remainingCharge: 0,
		});

		expect(cents(allocation.amount)).toBe(10001);
		expect(
			cents(
				allocation.principalPaid +
					allocation.interestPaid +
					allocation.chargePaid,
			),
		).toBe(10001);
	});
});
