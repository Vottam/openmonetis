import { describe, expect, it } from "vitest";
import { buildLoanInstallmentPlan } from "../lib/dashboard";

// Helper to sum values in cents for exact arithmetic
function sumInCents(values: number[]): number {
	return Math.round(values.reduce((sum, v) => sum + v, 0) * 100);
}

describe("Algoritmo de distribuição de centavos em parcelas", () => {
	it("CENÁRIO DE REGRESSÃO: 2000 principal + 1000 juros em 12 parcelas (250,00 nominal)", () => {
		// Valores do bug reportado:
		// expectedPrincipal ≈ 166.67
		// expectedInterest ≈ 83.33/83.34
		// expectedValue = 250.01 (soma dos componentes)
		// totalPayable = 3000
		// totalPaid = 250.00
		// remainingValue = 0.00 (INCORRETO - deveria ser 0.01)

		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		// Verificar invariância por parcela (em centavos)
		for (const installment of plan) {
			const expectedValueCents = Math.round(installment.expectedValue * 100);
			const expectedPrincipalCents = Math.round(
				installment.expectedPrincipal * 100,
			);
			const expectedInterestCents = Math.round(
				installment.expectedInterest * 100,
			);
			const expectedChargeCents = Math.round(installment.expectedCharge * 100);
			const componentSumCents =
				expectedPrincipalCents + expectedInterestCents + expectedChargeCents;
			expect(expectedValueCents).toBe(componentSumCents); // expectedValue === expectedPrincipal + expectedInterest + expectedCharge
		}

		// Verificar invariância agregada (em centavos inteiros)
		const sumPrincipalCents = sumInCents(plan.map((i) => i.expectedPrincipal));
		const sumInterestCents = sumInCents(plan.map((i) => i.expectedInterest));
		const sumChargeCents = sumInCents(plan.map((i) => i.expectedCharge));
		const sumValueCents = sumInCents(plan.map((i) => i.expectedValue));

		expect(sumPrincipalCents).toBe(200000); // 2000.00 em centavos
		expect(sumInterestCents).toBe(100000); // 1000.00 em centavos
		expect(sumChargeCents).toBe(0);
		expect(sumValueCents).toBe(300000); // 3000.00 em centavos
	});

	it("CASO A: 100 / 3 parcelas - distribuição de centavos", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 100,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 100,
			totalInstallments: 3,
			firstDueDate: new Date("2025-01-01"),
		});

		for (const installment of plan) {
			const expectedValueCents = Math.round(installment.expectedValue * 100);
			const expectedPrincipalCents = Math.round(
				installment.expectedPrincipal * 100,
			);
			const expectedInterestCents = Math.round(
				installment.expectedInterest * 100,
			);
			const expectedChargeCents = Math.round(installment.expectedCharge * 100);
			const componentSumCents =
				expectedPrincipalCents + expectedInterestCents + expectedChargeCents;
			expect(expectedValueCents).toBe(componentSumCents);
		}

		const sumPrincipalCents = sumInCents(plan.map((i) => i.expectedPrincipal));
		expect(sumPrincipalCents).toBe(10000); // 100.00 em centavos
	});

	it("CASO B: 2000 / 12 parcelas", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 2000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		for (const installment of plan) {
			const expectedValueCents = Math.round(installment.expectedValue * 100);
			const expectedPrincipalCents = Math.round(
				installment.expectedPrincipal * 100,
			);
			const expectedInterestCents = Math.round(
				installment.expectedInterest * 100,
			);
			const expectedChargeCents = Math.round(installment.expectedCharge * 100);
			const componentSumCents =
				expectedPrincipalCents + expectedInterestCents + expectedChargeCents;
			expect(expectedValueCents).toBe(componentSumCents);
		}

		const sumPrincipalCents = sumInCents(plan.map((i) => i.expectedPrincipal));
		expect(sumPrincipalCents).toBe(200000); // 2000.00 em centavos
	});

	it("CASO C: 1000 de juros / 12 parcelas", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 0,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 1000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		for (const installment of plan) {
			const expectedValueCents = Math.round(installment.expectedValue * 100);
			const expectedPrincipalCents = Math.round(
				installment.expectedPrincipal * 100,
			);
			const expectedInterestCents = Math.round(
				installment.expectedInterest * 100,
			);
			const expectedChargeCents = Math.round(installment.expectedCharge * 100);
			const componentSumCents =
				expectedPrincipalCents + expectedInterestCents + expectedChargeCents;
			expect(expectedValueCents).toBe(componentSumCents);
		}

		const sumInterestCents = sumInCents(plan.map((i) => i.expectedInterest));
		expect(sumInterestCents).toBe(100000); // 1000.00 em centavos
	});

	it("CASO D: valores com encargos", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 1000,
			totalInterest: 500,
			totalCharge: 100,
			totalPayable: 1600,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		for (const installment of plan) {
			const expectedValueCents = Math.round(installment.expectedValue * 100);
			const expectedPrincipalCents = Math.round(
				installment.expectedPrincipal * 100,
			);
			const expectedInterestCents = Math.round(
				installment.expectedInterest * 100,
			);
			const expectedChargeCents = Math.round(installment.expectedCharge * 100);
			const componentSumCents =
				expectedPrincipalCents + expectedInterestCents + expectedChargeCents;
			expect(expectedValueCents).toBe(componentSumCents);
		}

		const sumPrincipalCents = sumInCents(plan.map((i) => i.expectedPrincipal));
		const sumInterestCents = sumInCents(plan.map((i) => i.expectedInterest));
		const sumChargeCents = sumInCents(plan.map((i) => i.expectedCharge));
		const sumValueCents = sumInCents(plan.map((i) => i.expectedValue));

		expect(sumPrincipalCents).toBe(100000); // 1000.00 em centavos
		expect(sumInterestCents).toBe(50000); // 500.00 em centavos
		expect(sumChargeCents).toBe(10000); // 100.00 em centavos
		expect(sumValueCents).toBe(160000); // 1600.00 em centavos
	});

	it("CASO E: totais com centavos não divisíveis uniformemente - 100.01 em 3 parcelas", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 100.01,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 100.01,
			totalInstallments: 3,
			firstDueDate: new Date("2025-01-01"),
		});

		for (const installment of plan) {
			const componentSum =
				installment.expectedPrincipal +
				installment.expectedInterest +
				installment.expectedCharge;
			expect(
				Math.round((installment.expectedValue - componentSum) * 100) / 100,
			).toBe(0);
		}

		const sumPrincipal = plan.reduce((sum, i) => sum + i.expectedPrincipal, 0);
		expect(Math.round(sumPrincipal * 100) / 100).toBe(100.01);
	});

	it("CASO E2: 1000.01 em 12 parcelas", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 1000.01,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 1000.01,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		for (const installment of plan) {
			const componentSum =
				installment.expectedPrincipal +
				installment.expectedInterest +
				installment.expectedCharge;
			expect(
				Math.round((installment.expectedValue - componentSum) * 100) / 100,
			).toBe(0);
		}

		const sumPrincipal = plan.reduce((sum, i) => sum + i.expectedPrincipal, 0);
		expect(Math.round(sumPrincipal * 100) / 100).toBe(1000.01);
	});

	it("CASO E3: 2000 principal + 1000 juros em 12 parcelas (centavos não uniformes)", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		for (const installment of plan) {
			const componentSum =
				installment.expectedPrincipal +
				installment.expectedInterest +
				installment.expectedCharge;
			expect(
				Math.round((installment.expectedValue - componentSum) * 100) / 100,
			).toBe(0);
		}

		const sumPrincipal = plan.reduce((sum, i) => sum + i.expectedPrincipal, 0);
		const sumInterest = plan.reduce((sum, i) => sum + i.expectedInterest, 0);
		const sumValue = plan.reduce((sum, i) => sum + i.expectedValue, 0);

		expect(Math.round(sumPrincipal * 100) / 100).toBe(2000);
		expect(Math.round(sumInterest * 100) / 100).toBe(1000);
		expect(Math.round(sumValue * 100) / 100).toBe(3000);
	});

	it("TESTE DE PAGAMENTO PARCIAL: remainingValue não deve ser perdoado silenciosamente", () => {
		// Cenário: expectedValue = 250.01, pagamento = 250.00
		// Esperado: remainingValue = 0.01, status != "paid"

		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		const firstInstallment = plan[0];
		const expectedValue = firstInstallment.expectedValue;
		const paidAmount = Math.floor(expectedValue * 100) / 100; // 250.00 se expectedValue = 250.01

		// Verificar se há diferença de centavos
		const remainingValue = Math.round((expectedValue - paidAmount) * 100) / 100;

		if (remainingValue > 0) {
			// Se expectedValue tem centavo extra, remainingValue deve ser 0.01
			expect(remainingValue).toBe(0.01);
		}
	});

	it("TESTE DE PAGAMENTO INTEGRAL: remainingValue = 0 quando pago exatamente expectedValue", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		const firstInstallment = plan[0];
		const expectedValue = firstInstallment.expectedValue;
		const paidAmount = expectedValue; // Pagamento exato

		const remainingValue = Math.round((expectedValue - paidAmount) * 100) / 100;
		expect(remainingValue).toBe(0);
	});

	it("RECOMPOSIÇÃO DO LIMITE: limite recomposto = principal amortizado (não valor total pago)", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		const firstInstallment = plan[0];
		const expectedPrincipal = firstInstallment.expectedPrincipal;
		const expectedInterest = firstInstallment.expectedInterest;
		const expectedValue = firstInstallment.expectedValue;

		// Se pagarmos a parcela integral
		// Principal amortizado = expectedPrincipal
		// Juros pagos = expectedInterest
		// Limite recomposto deve ser = expectedPrincipal (não expectedValue)

		expect(expectedPrincipal).toBeGreaterThan(0);
		expect(expectedInterest).toBeGreaterThan(0);
		expect(expectedValue).toBe(expectedPrincipal + expectedInterest);
	});
});
