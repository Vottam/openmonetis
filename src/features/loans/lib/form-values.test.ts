import { describe, expect, it } from "vitest";
import {
	buildLoanOperationInitialValues,
	buildLoanOperationPreview,
	parseLoanOperationFormValues,
} from "./form-values";

describe("loan form values", () => {
	it("abre nova operação com apenas os campos essenciais", () => {
		const initialValues = buildLoanOperationInitialValues({
			institutionId: "inst-1",
			loanType: "revolving",
		});

		expect(initialValues).toEqual({
			institutionId: "inst-1",
			loanType: "revolving",
			primaryAmount: "",
			installmentValue: "",
			totalInstallments: "",
			nextDueDate: "",
		});
		expect(initialValues).not.toHaveProperty("principalBorrowed");
		expect(initialValues).not.toHaveProperty("amountReceived");
		expect(initialValues).not.toHaveProperty("totalInterest");
		expect(initialValues).not.toHaveProperty("totalCharge");
		expect(initialValues).not.toHaveProperty("totalPayable");
		expect(initialValues).not.toHaveProperty("currentInstallment");
		expect(initialValues).not.toHaveProperty("status");
	});

	it("deriva total a pagar, custo financeiro e último vencimento", () => {
		const preview = buildLoanOperationPreview({
			institutionId: "inst-1",
			loanType: "fixed",
			primaryAmount: "1000,00",
			installmentValue: "600,00",
			totalInstallments: "2",
			nextDueDate: "2025-02-03",
		});

		expect(preview).not.toBeNull();
		expect(preview?.totalPayable).toBe(1200);
		expect(preview?.financialCost).toBe(200);
		expect(preview?.finalDueDate.toISOString().slice(0, 10)).toBe("2025-03-03");
	});

	it("ajusta vencimentos caindo em fim de semana para o próximo dia útil", () => {
		const preview = buildLoanOperationPreview({
			institutionId: "inst-1",
			loanType: "fixed",
			primaryAmount: "1000,00",
			installmentValue: "1000,00",
			totalInstallments: "1",
			nextDueDate: "2025-02-02",
		});

		expect(preview).not.toBeNull();
		expect(preview?.finalDueDate.toISOString().slice(0, 10)).toBe("2025-02-03");
	});

	it("permite custo financeiro zero", () => {
		const parsed = parseLoanOperationFormValues({
			institutionId: "inst-1",
			loanType: "fixed",
			primaryAmount: "1000,00",
			installmentValue: "500,00",
			totalInstallments: "2",
			nextDueDate: "2025-02-03",
		});

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.data.principalBorrowed).toBe(1000);
			expect(parsed.data.amountReceived).toBe(1000);
			expect(parsed.data.totalContracted).toBe(1000);
			expect(parsed.data.totalPayable).toBe(1000);
			expect(parsed.data.totalInterest).toBe(0);
			expect(parsed.data.totalCharge).toBe(0);
			expect(parsed.data.financialCost).toBe(0);
		}
	});

	it("bloqueia submissão quando o total a pagar fica abaixo do principal", () => {
		const parsed = parseLoanOperationFormValues({
			institutionId: "inst-1",
			loanType: "revolving",
			primaryAmount: "1000,00",
			installmentValue: "400,00",
			totalInstallments: "2",
			nextDueDate: "2025-02-03",
		});

		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.error).toMatch(/total a pagar não pode ser menor/i);
		}
	});

	it("bloqueia submissão com campos monetários obrigatórios vazios", () => {
		const parsed = parseLoanOperationFormValues({
			institutionId: "inst-1",
			loanType: "revolving",
			primaryAmount: "",
			installmentValue: "",
			totalInstallments: "",
			nextDueDate: "",
		});

		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.error).toMatch(/limite concedido|valor contratado/i);
		}
	});
});
