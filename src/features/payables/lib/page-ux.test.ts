import { describe, expect, it } from "vitest";
import {
	buildInformAmountInitialValue,
	buildInformAmountInputValue,
	buildPayableHistoryHref,
	buildPayableOccurrenceDetailFields,
	buildPayableTemplateFields,
	formatPayableRecurrenceLabel,
	formatPayableTemplatePeriod,
	getDisplayedOccurrenceAmount,
	getOccurrenceActionVisibility,
	isEstimatedOccurrence,
	getPayableLifecycleActionLabel,
	getPayableLifecycleLabel,
	getPayableLifecycleState,
} from "./page-ux";

const normalize = (value: string) => value.replaceAll("\u00a0", " ");
const baseItem = {
	payable: {
		id: "payable-1",
		description: "Aluguel",
		supplierName: "Imobiliária X",
		categoryId: "cat-1",
		categoryName: "Moradia",
		categoryIcon: "home",
		recurrenceType: "monthly_variable",
		status: "active",
		startsAt: "2026-08-01",
		endsAt: "2027-07-31",
	},
	occurrence: {
		id: "occ-1",
		period: "2026-08",
		dueDate: "2026-08-10",
		status: "awaiting_amount",
		expectedAmount: 150,
		actualAmount: null,
		paidAmount: 0,
		remainingAmount: 150,
		isOverdue: false,
		payments: [],
	},
} as const;

describe("page-ux", () => {
	it("PERIODICITY_LABELS_ARE_HUMAN_READABLE", () => {
		expect(formatPayableRecurrenceLabel("once")).toBe("Única");
		expect(formatPayableRecurrenceLabel("monthly_fixed")).toBe("Mensal fixa");
		expect(formatPayableRecurrenceLabel("monthly_variable")).toBe("Mensal variável");
	});

	it("LIFECYCLE_LABELS_ARE_HUMAN_READABLE", () => {
		expect(getPayableLifecycleState({ status: "active", endsAt: null })).toBe("active");
		expect(getPayableLifecycleLabel({ status: "active", endsAt: null })).toBe("Ativa");
		expect(getPayableLifecycleActionLabel({ status: "active", endsAt: null })).toBe("Inativar");
		expect(getPayableLifecycleState({ status: "cancelled", endsAt: null })).toBe("inactive");
		expect(getPayableLifecycleLabel({ status: "cancelled", endsAt: null })).toBe("Inativa");
		expect(getPayableLifecycleActionLabel({ status: "cancelled", endsAt: null })).toBe("Ativar");
		expect(
			getPayableLifecycleState({ status: "active", endsAt: "2026-07-31" }, "2026-08-01"),
		).toBe("expired");
		expect(
			getPayableLifecycleLabel({ status: "active", endsAt: "2026-07-31" }, "2026-08-01"),
		).toBe("Contrato encerrado");
		expect(
			getPayableLifecycleActionLabel({ status: "active", endsAt: "2026-07-31" }, "2026-08-01"),
		).toBe("Renovar");
	});

	it("PERIODICITY_PERIODS_SHOW_FRIENDLY_CONTRACT_RANGE", () => {
		expect(
			formatPayableTemplatePeriod({
				recurrenceType: "monthly_fixed",
				startsAt: "2026-08-01",
				endsAt: "2027-07-31",
			}),
		).toBe("08/2026 a 07/2027");
		expect(
			formatPayableTemplatePeriod({
				recurrenceType: "monthly_variable",
				startsAt: "2026-08-01",
				endsAt: null,
			}),
		).toBe("08/2026 · sem data final");
		expect(
			formatPayableTemplatePeriod({
				recurrenceType: "once",
				startsAt: "2026-08-14",
				endsAt: null,
			}),
		).toBe("Em 14/08/2026");
	});

	it("TEMPLATE_FIELDS_INCLUDE_PERIODICITY_AND_PERIOD", () => {
		const fields = buildPayableTemplateFields(baseItem.payable as never);
		expect(fields.map((field) => field.label)).toEqual(
			expect.arrayContaining([
				"Periodicidade",
				"Período",
				"Valor padrão",
				"Primeiro vencimento",
				"Categoria",
			]),
		);
		expect(fields.find((field) => field.label === "Periodicidade")?.value).toBe("Mensal variável");
		expect(fields.find((field) => field.label === "Período")?.value).toBe("08/2026 a 07/2027");
	});

	it("UPDATE_VALUE_TRIGGER_WORKS", () => {
		expect(
			getOccurrenceActionVisibility(baseItem as never, "operational").showInformAmount,
		).toBe(true);
		expect(isEstimatedOccurrence(baseItem.payable as never, baseItem.occurrence as never)).toBe(true);
		expect(normalize(buildInformAmountInitialValue(baseItem.occurrence as never))).toBe("R$ 150,00");
		expect(buildInformAmountInputValue(baseItem.occurrence as never)).toBe("150,00");
	});

	it("UPDATE_VALUE_DIALOG_OPENS", () => {
		expect(
			buildPayableOccurrenceDetailFields(baseItem as never).map((field) => field.label),
		).toEqual(
			expect.arrayContaining(["Título", "Fornecedor", "Categoria", "Competência", "Vencimento", "Status"]),
		);
	});

	it("UPDATE_VALUE_SUBMIT_CALLS_EXISTING_ACTION", () => {
		expect(getDisplayedOccurrenceAmount(baseItem.occurrence as never)).toBe(150);
		const updated = {
			...baseItem,
			occurrence: {
				...baseItem.occurrence,
				actualAmount: 163.42,
				remainingAmount: 13.42,
			},
		};
		expect(getDisplayedOccurrenceAmount(updated.occurrence as never)).toBe(163.42);
		expect(isEstimatedOccurrence(updated.payable as never, updated.occurrence as never)).toBe(false);
	});

	it("DETAIL_TRIGGER_WORKS", () => {
		expect(getOccurrenceActionVisibility(baseItem as never, "operational").showDetails).toBe(true);
	});

	it("DETAIL_DIALOG_OPENS", () => {
		expect(
			normalize(
				buildPayableOccurrenceDetailFields(baseItem as never).find((field) => field.label === "Valor estimado")?.value ?? "",
			),
		).toBe("R$ 150,00");
	});

	it("PAYMENT_ACTION_STILL_WORKS", () => {
		const payable = {
			...baseItem,
			occurrence: {
				...baseItem.occurrence,
				status: "partial",
				actualAmount: 120,
				remainingAmount: 30,
			},
		};
		expect(getOccurrenceActionVisibility(payable as never, "operational").showPay).toBe(true);
	});

	it("HISTORY_ACTION_WORKS", () => {
		expect(getOccurrenceActionVisibility(baseItem as never, "operational").showHistory).toBe(true);
		expect(getOccurrenceActionVisibility(baseItem as never, "history").showHistory).toBe(false);
	});

	it("PAYABLE_HISTORY_ROUTE_WORKS", () => {
		expect(buildPayableHistoryHref("payable-1")).toBe("/payables/payable-1");
	});
});
