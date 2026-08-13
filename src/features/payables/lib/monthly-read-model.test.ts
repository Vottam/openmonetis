import { describe, expect, it } from "vitest";
import {
	computeMonthlySummary,
	filterOccurrencesByCompetence,
	getCompetenceMonthString,
	getOccurrenceDisplayStatus,
	sortOccurrencesForDisplay,
	validateInvariance,
} from "./monthly-read-model";

describe("Monthly Read Model - Phase B2 (Deterministic)", () => {
	// Helper: occurrence with all standard fields
	const createOccurrence = (overrides: Partial<any> = {}) => ({
		period: "2026-08",
		dueDate: "2026-08-05",
		isOverdue: false,
		status: "pending" as const,
		expectedAmount: 100000,
		actualAmount: null,
		paidAmount: 0,
		remainingAmount: 100000,
		...overrides,
	});

	// Helper: fully paid occurrence
	const paidOcc = (overrides: Partial<any> = {}) => ({
		period: "2026-08",
		dueDate: "2026-08-05",
		isOverdue: false,
		status: "paid" as const,
		expectedAmount: 100000,
		actualAmount: null,
		paidAmount: 100000,
		remainingAmount: 0,
		...overrides,
	});

	// Helper: partial occurrence
	const partialOcc = (overrides: Partial<any> = {}) => ({
		period: "2026-08",
		dueDate: "2026-08-05",
		isOverdue: false,
		status: "partial" as const,
		expectedAmount: 100000,
		actualAmount: null,
		paidAmount: 40000,
		remainingAmount: 60000,
		partialPayments: 1,
		...overrides,
	});

	// Helper: awaiting_amount occurrence
	const awaitingOcc = (overrides: Partial<any> = {}) => ({
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
		it("paid occurrence: paid=100000, remaining=0, totalKnown=100000", () => {
			const summary = computeMonthlySummary([paidOcc()]);
			expect(summary.paid).toBe(100000);
			expect(summary.remaining).toBe(0);
			expect(summary.totalKnown).toBe(100000);
			expect(summary.overdue).toBe(0);
			expect(summary.awaitingAmountCount).toBe(0);
		});

		it("partial occurrence: paid=40000, remaining=60000, totalKnown=100000", () => {
			const summary = computeMonthlySummary([partialOcc()]);
			expect(summary.paid).toBe(40000);
			expect(summary.remaining).toBe(60000);
			expect(summary.totalKnown).toBe(100000);
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

		it("mixed: paid + partial + awaiting", () => {
			const summary = computeMonthlySummary([
				paidOcc(),
				partialOcc(),
				awaitingOcc(),
			]);
			expect(summary.paid).toBe(140000); // 100000 + 40000
			expect(summary.remaining).toBe(60000);
			expect(summary.totalKnown).toBe(200000); // 100000 + 100000
			expect(summary.overdue).toBe(0);
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

		it("extracts from dueDate", () => {
			expect(
				getCompetenceMonthString({
					...createOccurrence(),
					period: null,
					dueDate: "2026-08-20",
				}),
			).toBe("2026-08");
		});
	});

	describe("sortOccurrencesForDisplay", () => {
		it("should sort overdue first, then partial, then pending", () => {
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
					status: "overdue",
					isOverdue: true,
					dueDate: "2026-07-01",
				}),
			];
			const sorted = sortOccurrencesForDisplay(occs);
			// overdue (priority 0) should come first
			expect(sorted[0].status).toBe("overdue");
			// partial (priority 1) should come second
			expect(sorted[1].status).toBe("partial");
			// pending (priority 2) should come third
			expect(sorted[2].status).toBe("pending");
		});

		it("should sort by due date within same status", () => {
			const occs = [
				createOccurrence({ dueDate: "2026-08-15", isOverdue: false }),
				createOccurrence({ dueDate: "2026-08-01", isOverdue: false }),
			];
			const sorted = sortOccurrencesForDisplay(occs);
			expect(sorted[0].dueDate).toBe("2026-08-01");
			expect(sorted[1].dueDate).toBe("2026-08-15");
		});
	});
});
