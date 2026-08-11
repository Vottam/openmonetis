import { describe, expect, it } from "vitest";
import {
	buildLoanOperationInitialValues,
	parseLoanOperationFormValues,
} from "./form-values";

describe("loan form values", () => {
	it("abre nova operação sem valores financeiros preenchidos", () => {
		const initialValues = buildLoanOperationInitialValues({
			institutionId: "inst-1",
			loanType: "revolving",
		});

		expect(initialValues.principalBorrowed).toBe("");
		expect(initialValues.amountReceived).toBe("");
		expect(initialValues.totalContracted).toBe("");
		expect(initialValues.totalInterest).toBe("");
		expect(initialValues.totalCharge).toBe("");
		expect(initialValues.totalPayable).toBe("");
		expect(initialValues.totalInstallments).toBe("");
		expect(initialValues.currentInstallment).toBe("1");
		expect(initialValues.startDate).not.toBe("");
	});

	it("bloqueia submissão com campos monetários obrigatórios vazios", () => {
		const parsed = parseLoanOperationFormValues({
			institutionId: "inst-1",
			loanType: "revolving",
			principalBorrowed: "",
			amountReceived: "",
			totalContracted: "",
			totalInterest: "",
			totalCharge: "",
			totalPayable: "",
			startDate: "2025-01-01",
			endDate: "",
			nextDueDate: "2025-02-01",
			totalInstallments: "",
			currentInstallment: "1",
			status: "active",
		});

		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.error).toMatch(/principal tomado|valor principal tomado/i);
		}
	});
});
