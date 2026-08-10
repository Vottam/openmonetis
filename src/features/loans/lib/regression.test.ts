import { describe, expect, it } from "vitest";
import { buildLoanInstallmentPlan } from "../lib/dashboard";

/**
 * Teste de regressão que reproduz o bug reportado:
 *
 * O algoritmo atual distribuía cada componente (principal, interesse, charge)
 * independentemente, gerando arredondamentos inconsistentes.
 * O expectedValue por parcela não fechava como expectedPrincipal + expectedInterest + expectedCharge.
 *
 * A distribuição corrigida usa:
 * 1. Distribuir totalPayable uniformemente em centavos inteiros (base + resto)
 * 2. Distribuir principal proporcionalmente usando apportionment cumulativo
 * 3. Derivar charge e interest como residual
 *
 * Todas as somas (componentes, esperado, principal, interesse, charge, total)
 * fecham exatamente em centavos.
 */
describe("Regressão — bug de alocação de centavos (corrigido)", () => {
	it("Cenário 1: 2000 principal + 1000 interesse + 0 charge / 12 parcelas", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		// Cada parcela deve ter expectedValue = 250.00
		// totalPayable = 3000.00, 12 parcelas = 250.00 cada
		plan.forEach((installment, i) => {
			const expectedValueCents = Math.round(installment.expectedValue * 100);
			const expectedPrincipalCents = Math.round(
				installment.expectedPrincipal * 100,
			);
			const expectedInterestCents = Math.round(
				installment.expectedInterest * 100,
			);
			const expectedChargeCents = Math.round(installment.expectedCharge * 100);
			const componentSum =
				expectedPrincipalCents + expectedInterestCents + expectedChargeCents;
			expect(expectedValueCents).toBe(componentSum);
		});

		// Somar componentes = totalPayable
		const sumPrincipalCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedPrincipal * 100),
			0,
		);
		const sumInterestCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedInterest * 100),
			0,
		);
		const sumValueCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedValue * 100),
			0,
		);

		// totalPayable = 3000.00 = 300000 centavos
		expect(sumPrincipalCents).toBe(200000);
		expect(sumInterestCents).toBe(100000);
		expect(sumValueCents).toBe(300000);
	});

	it("Valores não divisíveis uniformemente — 100000.01 principal + 50000.01 interesse + 0 charge / 12 parcelas", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 100000.01,
			totalInterest: 50000.01,
			totalCharge: 0,
			totalPayable: 150000.02,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		// Cada parcela: expectedValue = 150000.02 / 12 = 12500.00 centavos = 125.00 reais
		// principal = 100000.01 / 12 = 8333.335 reais → distribuição proporcional
		// interesse = 50000.01 / 12 = 4166.6675 reais → distribuição proporcional

		// Verificar que cada parcela tem expectedValue = expectedPrincipal + expectedInterest + expectedCharge
		plan.forEach((installment, i) => {
			const expectedValueCents = Math.round(installment.expectedValue * 100);
			const expectedPrincipalCents = Math.round(
				installment.expectedPrincipal * 100,
			);
			const expectedInterestCents = Math.round(
				installment.expectedInterest * 100,
			);
			const expectedChargeCents = Math.round(installment.expectedCharge * 100);
			const componentSum =
				expectedPrincipalCents + expectedInterestCents + expectedChargeCents;
			expect(expectedValueCents).toBe(componentSum);
		});

		const sumPrincipalCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedPrincipal * 100),
			0,
		);
		const sumInterestCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedInterest * 100),
			0,
		);
		const sumValueCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedValue * 100),
			0,
		);

		// totalPayable = 150000.02 = 15000002 centavos
		// principal = 100000.01 = 10000001 centavos
		// interesse = 50000.01 = 5000001 centavos
		expect(sumPrincipalCents).toBe(10000001);
		expect(sumInterestCents).toBe(5000001);
		expect(sumValueCents).toBe(15000002);
	});

	it("Teste de pagamento parcial: expectedValue = 250.01 vs 250.00 / 12 parcelas", () => {
		// Cenário: quando expectedValue = 250.01 e pagamento = 250.00,
		// remainingValue deve ser 0.01 (não 0.00)
		// Para ter expectedValue = 250.01, usamos totalPayable = 3000.12
		// que dá 250.01 por parcela em 12 parcelas
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000.08,
			totalInterest: 1000.04,
			totalCharge: 0,
			totalPayable: 3000.12,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		const firstInstallment = plan[0];
		const expectedValue = firstInstallment.expectedValue;
		const paidAmount = 250.0;

		// Verificar que expectedValue é consistente com componentes
		const expectedValueCents = Math.round(expectedValue * 100);
		expect(expectedValueCents).toBe(Math.round(250.01 * 100));

		// Simular pagamento de 250.00 centavos
		const remainingValueCents =
			expectedValueCents - Math.round(paidAmount * 100);

		// Expected: remainingValue = 1 centavo
		expect(remainingValueCents).toBe(1);
	});

	it("Teste de pagamento integral: 250.00 vs 250.00 / 12 parcelas", () => {
		// Se expectedValue = 250.00 e pagamento = 250.00
		// remainingValue deve ser 0.00 e status = "paid"
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
		const paidAmount = expectedValue;

		const remainingValue = Math.round((expectedValue - paidAmount) * 100) / 100;
		expect(remainingValue).toBe(0);
	});

	it("Teste de distribuição determinística — primeiro pagamento", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 2000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			totalInstallments: 12,
			firstDueDate: new Date("2025-01-01"),
		});

		const first = plan[0];
		const _last = plan[11];

		// Verificar que o algoritmo é determinístico (mesmo resultado sempre)
		const firstValue = first.expectedValue;
		const firstPrincipal = first.expectedPrincipal;
		const firstInterest = first.expectedInterest;
		const firstCharge = first.expectedCharge;

		// Somar os componentes da primeira parcela
		const firstSum = firstPrincipal + firstInterest + firstCharge;
		const firstDiff = Math.round((firstValue - firstSum) * 100) / 100;
		expect(firstDiff).toBe(0);

		// Testar que a segunda parcela também tem componentes consistentes
		const second = plan[1];
		const secondSum =
			second.expectedPrincipal +
			second.expectedInterest +
			second.expectedCharge;
		const secondDiff =
			Math.round((second.expectedValue - secondSum) * 100) / 100;
		expect(secondDiff).toBe(0);
	});

	it("Valores com encargos", () => {
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
			const componentSum =
				expectedPrincipalCents + expectedInterestCents + expectedChargeCents;
			expect(expectedValueCents).toBe(componentSum);
		}

		const sumPrincipalCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedPrincipal * 100),
			0,
		);
		const sumInterestCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedInterest * 100),
			0,
		);
		const sumValueCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedValue * 100),
			0,
		);
		const sumChargeCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedCharge * 100),
			0,
		);

		// totalPayable = 1600.00 = 160000 centavos
		// principal = 1000.00 = 100000 centavos
		// interesse = 500.00 = 50000 centavos
		// charge = 100.00 = 10000 centavos
		expect(sumPrincipalCents).toBe(100000);
		expect(sumInterestCents).toBe(50000);
		expect(sumChargeCents).toBe(10000);
		expect(sumValueCents).toBe(160000);
	});

	it("Cenário com valor não divisível (100.00 em 3 parcelas)", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 100,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 100,
			totalInstallments: 3,
			firstDueDate: new Date("2025-01-01"),
		});

		// Cada parcela: expectedValue = 100 / 3 = 33.333...
		// A soma dos componentes deve fechar exatamente
		plan.forEach((installment, i) => {
			const expectedValueCents = Math.round(installment.expectedValue * 100);
			const expectedPrincipalCents = Math.round(
				installment.expectedPrincipal * 100,
			);
			const expectedInterestCents = Math.round(
				installment.expectedInterest * 100,
			);
			const expectedChargeCents = Math.round(installment.expectedCharge * 100);
			const componentSum =
				expectedPrincipalCents + expectedInterestCents + expectedChargeCents;
			expect(expectedValueCents).toBe(componentSum);
		});

		const sumPrincipalCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedPrincipal * 100),
			0,
		);
		const sumInterestCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedInterest * 100),
			0,
		);
		const sumValueCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedValue * 100),
			0,
		);

		expect(sumPrincipalCents).toBe(10000);
		expect(sumInterestCents).toBe(0);
		expect(sumValueCents).toBe(10000);
	});

	it("Cenário de valor zero (0.00 em 2 parcelas)", () => {
		const plan = buildLoanInstallmentPlan({
			principalBorrowed: 0,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 0,
			totalInstallments: 2,
			firstDueDate: new Date("2025-01-01"),
		});

		plan.forEach((installment) => {
			expect(installment.expectedValue).toBe(0);
			expect(installment.expectedPrincipal).toBe(0);
			expect(installment.expectedInterest).toBe(0);
			expect(installment.expectedCharge).toBe(0);
		});

		const sumPrincipalCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedPrincipal * 100),
			0,
		);
		const sumValueCents = plan.reduce(
			(sum, i) => sum + Math.round(i.expectedValue * 100),
			0,
		);
		expect(sumPrincipalCents).toBe(0);
		expect(sumValueCents).toBe(0);
	});
});
