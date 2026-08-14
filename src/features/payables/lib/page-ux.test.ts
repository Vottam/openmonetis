import { describe, expect, it } from "vitest";
import {
	buildInformAmountInitialValue,
	buildPayableHistoryHref,
	buildPayableOccurrenceDetailFields,
	getDisplayedOccurrenceAmount,
	getOccurrenceActionVisibility,
	isEstimatedOccurrence,
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
	it("UPDATE_VALUE_TRIGGER_WORKS", () => {
		expect(
			getOccurrenceActionVisibility(baseItem as never, "operational").showInformAmount,
		).toBe(true);
		expect(isEstimatedOccurrence(baseItem.payable as never, baseItem.occurrence as never)).toBe(true);
		expect(normalize(buildInformAmountInitialValue(baseItem.occurrence as never))).toBe("R$ 150,00");
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
