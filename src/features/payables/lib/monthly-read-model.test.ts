import { describe, expect, it } from "vitest";
import {
	computeMonthlySummary,
	filterOccurrencesByCompetence,
	getCompetenceMonthString,
	getOccurrenceDisplayStatus,
	sortOccurrencesForDisplay,
	sortMonthlyPayableOccurrencesChronologically,
	validateInvariance,
} from "./monthly-read-model";

type TestOccurrence = {
	period: string;
	dueDate: string;
	isOverdue: boolean;
	status: "pending" | "paid" | "partial" | "awaiting_amount" | "cancelled";
	expectedAmount: number | null;
	actualAmount: number | null;
	paidAmount: number;
	remainingAmount: number | null;
};

describe("Monthly Read Model - Phase B2 (Deterministic)", () => {
	const createOccurrence = (overrides: Partial<TestOccurrence> = {}) => ({
		period: "2026-08",
		dueDate: "2026-08-05",
		isOverdue: false,
		status: "pending" as const,
		expectedAmount: 100,
		actualAmount: null,
		paidAmount: 0,
		remainingAmount: 100,
		...overrides,
	});

	const paidOcc = (overrides: Partial<TestOccurrence> = {}) => ({
		period: "2026-08",
		dueDate: "2026-08-05",
		isOverdue: false,
		status: "paid" as const,
		expectedAmount: 100,
		actualAmount: null,
		paidAmount: 100,
		remainingAmount: 0,
		...overrides,
	});

	const partialOcc = (overrides: Partial<TestOccurrence> = {}) => ({
		period: "2026-08",
		dueDate: "2026-08-05",
		isOverdue: false,
		status: "partial" as const,
		expectedAmount: 100,
		actualAmount: null,
		paidAmount: 40,
		remainingAmount: 60,
		...overrides,
	});

	const awaitingOcc = (overrides: Partial<TestOccurrence> = {}) => ({
		period: "2026-08",
		dueDate: "2026-08-05",
		isOverdue: false,
		status: "awaiting_amount" as const,
		expectedAmount: null,
		actualAmount: null,
		paidAmount: 0,
		remainingAmount: 0,
		...overrides,
	});

	describe("filterOccurrencesByCompetence", () => {
		it("should filter by correct competence month", () => {
			const occs = [
				createOccurrence(),
				createOccurrence({ period: "2026-07" }),
			];
			const result = filterOccurrencesByCompetence(occs, {
				year: 2026,
				month: 8,
			});
			expect(result.length).toBe(1);
			expect(result[0].period).toBe("2026-08");
		});

		it("should exclude different competence", () => {
			const occs = [
				createOccurrence({ period: "2026-07" }),
				createOccurrence({ period: "2026-09" }),
			];
			const result = filterOccurrencesByCompetence(occs, {
				year: 2026,
				month: 8,
			});
			expect(result.length).toBe(0);
		});
	});

	describe("computeMonthlySummary", () => {
		it("paid occurrence: paid=100, remaining=0, totalKnown=100", () => {
			const summary = computeMonthlySummary([paidOcc()]);
			expect(summary.paid).toBe(100);
			expect(summary.remaining).toBe(0);
			expect(summary.totalKnown).toBe(100);
			expect(summary.overdue).toBe(0);
			expect(summary.awaitingAmountCount).toBe(0);
		});

		it("partial occurrence: paid=40, remaining=60, totalKnown=100", () => {
			const summary = computeMonthlySummary([partialOcc()]);
			expect(summary.paid).toBe(40);
			expect(summary.remaining).toBe(60);
			expect(summary.totalKnown).toBe(100);
			expect(summary.overdue).toBe(0);
			expect(summary.awaitingAmountCount).toBe(0);
		});

		it("awaiting_amount: awaitingAmountCount=1, paid=0, remaining=0, totalKnown=0", () => {
			const summary = computeMonthlySummary([awaitingOcc()]);
			expect(summary.awaitingAmountCount).toBe(1);
			expect(summary.paid).toBe(0);
			expect(summary.remaining).toBe(0);
			expect(summary.totalKnown).toBe(0);
			expect(summary.overdue).toBe(0);
		});

		it("mixed reais example: totalKnown=2750, paid=2500, remaining=250, overdue=100", () => {
			const summary = computeMonthlySummary([
				paidOcc({ expectedAmount: 2500, paidAmount: 2500, remainingAmount: 0 }),
				partialOcc({
					expectedAmount: 100,
					paidAmount: 0,
					remainingAmount: 100,
					isOverdue: true,
				}),
				partialOcc({
					expectedAmount: 150,
					paidAmount: 0,
					remainingAmount: 150,
					isOverdue: false,
				}),
				awaitingOcc(),
			]);
			expect(summary.paid).toBe(2500);
			expect(summary.remaining).toBe(250);
			expect(summary.totalKnown).toBe(2750);
			expect(summary.overdue).toBe(100);
			expect(summary.awaitingAmountCount).toBe(1);
		});

		it("invariant: totalKnown = paid + remaining when all known", () => {
			const summary = computeMonthlySummary([paidOcc(), partialOcc()]);
			expect(validateInvariance(summary)).toBe(true);
		});
	});

	describe("getOccurrenceDisplayStatus", () => {
		it("paid status returns paid", () => {
			expect(getOccurrenceDisplayStatus(paidOcc())).toBe("paid");
		});

		it("pending with isOverdue=false returns pending", () => {
			expect(
				getOccurrenceDisplayStatus(createOccurrence({ isOverdue: false })),
			).toBe("pending");
		});

		it("pending with isOverdue=true returns overdue", () => {
			expect(
				getOccurrenceDisplayStatus({ ...createOccurrence(), isOverdue: true }),
			).toBe("overdue");
		});

		it("partial returns partial", () => {
			expect(getOccurrenceDisplayStatus(partialOcc())).toBe("partial");
		});

		it("awaiting_amount returns awaiting", () => {
			expect(getOccurrenceDisplayStatus(awaitingOcc())).toBe("awaiting");
		});

		it("cancelled returns cancelled", () => {
			expect(
				getOccurrenceDisplayStatus({
					...createOccurrence(),
					status: "cancelled",
				}),
			).toBe("cancelled");
		});
	});

	describe("getCompetenceMonthString", () => {
		it("extracts from period", () => {
			expect(getCompetenceMonthString(createOccurrence())).toBe("2026-08");
		});

		it("returns null when period is invalid", () => {
			expect(
				getCompetenceMonthString({
					...createOccurrence(),
					period: null,
				}),
			).toBeNull();
		});
	});

	describe("sortOccurrencesForDisplay", () => {
		it("sorts by due date and keeps stable tie-breakers", () => {
			const occs = [
				createOccurrence({
					status: "pending",
					isOverdue: false,
					dueDate: "2026-08-15",
				}),
				createOccurrence({
					status: "partial",
					isOverdue: false,
					dueDate: "2026-08-10",
				}),
				createOccurrence({
					status: "pending",
					isOverdue: true,
					dueDate: "2026-07-01",
				}),
			];
			const sorted = sortOccurrencesForDisplay(occs);
			expect(sorted.map((item) => item.dueDate)).toEqual([
				"2026-07-01",
				"2026-08-10",
				"2026-08-15",
			]);
			expect(sorted[0].status).toBe("pending");
			expect(sorted[0].isOverdue).toBe(true);
		});

		it("keeps due date order within the same day", () => {
			const occs = [
				createOccurrence({ dueDate: "2026-08-15", isOverdue: false }),
				createOccurrence({ dueDate: "2026-08-01", isOverdue: false }),
			];
			const sorted = sortOccurrencesForDisplay(occs);
			expect(sorted[0].dueDate).toBe("2026-08-01");
		});
	});
	describe("sortMonthlyPayableOccurrencesChronologically", () => {
		it("sorts by due date before period", () => {
			const occs: any = [
				{
					payable: {
						id: "b",
						description: "B",
						supplierName: null,
						categoryId: null,
						categoryName: null,
						categoryIcon: null,
						recurrenceType: "monthly_fixed" as const,
						deactivatedAt: null,
						status: "active" as const,
					},
					occurrence: {
						id: "2",
						payableId: "b",
						period: "2026-09",
						dueDate: "2026-08-05",
						expectedAmount: 100,
						actualAmount: null,
						paidAmount: 0,
						remainingAmount: 100,
						status: "pending" as const,
						isOverdue: false,
						payments: [],
						createdAt: "2026-08-01T00:00:00.000Z",
						updatedAt: "2026-08-01T00:00:00.000Z",
					},
				},
				{
					payable: {
						id: "a",
						description: "A",
						supplierName: null,
						categoryId: null,
						categoryName: null,
						categoryIcon: null,
						recurrenceType: "monthly_fixed" as const,
						deactivatedAt: null,
						status: "active" as const,
					},
					occurrence: {
						id: "1",
						payableId: "a",
						period: "2026-08",
						dueDate: "2026-08-20",
						expectedAmount: 100,
						actualAmount: null,
						paidAmount: 0,
						remainingAmount: 100,
						status: "pending" as const,
						isOverdue: false,
						payments: [],
						createdAt: "2026-08-01T00:00:00.000Z",
						updatedAt: "2026-08-01T00:00:00.000Z",
					},
				},
			];

			const sorted = sortMonthlyPayableOccurrencesChronologically(occs);
			expect(sorted.map((item) => item.occurrence.period)).toEqual(["2026-09", "2026-08"]);
			expect(sorted.map((item) => item.occurrence.id)).toEqual(["2", "1"]);
		});
	});
});
