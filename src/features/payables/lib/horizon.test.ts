import { describe, expect, it } from "vitest";
import {
	buildPayableOccurrenceDueDate,
	buildPayableOccurrencePeriodRange,
	buildPayableOccurrenceSeeds,
	isPayableOccurrenceOverdue,
	PAYABLE_OCCURRENCE_HORIZON_MONTHS,
} from "./horizon";

function makeMonthlyFixedTemplate(
	overrides?: Partial<Parameters<typeof buildPayableOccurrencePeriodRange>[0]>,
) {
	return {
		id: "payable-fixed-test",
		recurrenceType: "monthly_fixed" as const,
		defaultAmount: 2500,
		dueDay: 10,
		startsAt: "2025-01-10",
		endsAt: null,
		status: "active" as const,
		...overrides,
	};
}

function makeMonthlyVariableTemplate() {
	return {
		id: "payable-variable-test",
		recurrenceType: "monthly_variable" as const,
		defaultAmount: null,
		dueDay: 15,
		startsAt: "2025-01-15",
		endsAt: null,
		status: "active" as const,
	};
}

describe("horizon de payables", () => {
	it("ajusta vencimentos em sábado e domingo para o próximo dia útil", () => {
		expect(
			buildPayableOccurrenceDueDate(
				{
					recurrenceType: "once",
					startsAt: "2026-08-15",
					dueDay: null,
				},
				"2026-08",
			),
		).toBe("2026-08-17");

		expect(
			buildPayableOccurrenceDueDate(
				{
					recurrenceType: "once",
					startsAt: "2026-08-16",
					dueDay: null,
				},
				"2026-08",
			),
		).toBe("2026-08-17");
	});

	it("gera horizonte rolante de seis meses para recorrência fixa", () => {
		const periods = buildPayableOccurrencePeriodRange(
			makeMonthlyFixedTemplate(),
			"2026-08",
			PAYABLE_OCCURRENCE_HORIZON_MONTHS,
		);

		expect(periods).toHaveLength(6);
		expect(periods[0]).toBe("2026-08");
		expect(periods[5]).toBe("2027-01");
	});

	it("gera ocorrências variáveis com valor esperado nulo e estado aguardando valor", () => {
		const seeds = buildPayableOccurrenceSeeds({
			template: makeMonthlyVariableTemplate(),
			existingPeriods: new Set(),
			referencePeriod: "2026-08",
			horizonMonths: 6,
		});

		expect(seeds).toHaveLength(6);
		expect(seeds[0]).toEqual(
			expect.objectContaining({
				expectedAmount: null,
				status: "awaiting_amount",
			}),
		);
	});

	it("não duplica períodos quando o horizonte é recalculado com os mesmos meses já existentes", () => {
		const template = makeMonthlyFixedTemplate();
		const firstPass = buildPayableOccurrenceSeeds({
			template,
			existingPeriods: new Set(),
			referencePeriod: "2026-08",
			horizonMonths: 6,
		});
		const secondPass = buildPayableOccurrenceSeeds({
			template,
			existingPeriods: new Set(firstPass.map((seed) => seed.period)),
			referencePeriod: "2026-08",
			horizonMonths: 6,
		});

		expect(firstPass).toHaveLength(6);
		expect(secondPass).toHaveLength(0);
	});

	it("deriva overdue sem depender de persistir o estado vencida", () => {
		expect(
			isPayableOccurrenceOverdue(
				{ status: "pending", dueDate: "2026-08-15" },
				"2026-08-16",
			),
		).toBe(true);
		expect(
			isPayableOccurrenceOverdue(
				{ status: "paid", dueDate: "2026-08-15" },
				"2026-08-16",
			),
		).toBe(false);
	});
});
