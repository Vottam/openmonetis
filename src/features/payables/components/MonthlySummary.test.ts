import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonthlySummary } from "./MonthlySummary";

const normalizeMarkup = (value: string) => value.replaceAll("\u00a0", " ");

const makeSummary = (overrides = {}) => ({
	totalKnown: 100,
	paid: 0,
	remaining: 100,
	overdue: 0,
	awaitingAmountCount: 0,
	...overrides,
});

describe("MonthlySummary", () => {
	it("renders summary amounts in reais without dividing by 100", () => {
		const html = renderToStaticMarkup(
			createElement(MonthlySummary, {
				period: "2026-08",
				summary: makeSummary(),
			}),
		);

		const normalized = normalizeMarkup(html);
		expect(normalized).toContain("R$ 100,00");
		expect(normalized).not.toContain("R$ 1,00");
	});

	it("renders the larger reais example consistently", () => {
		const html = renderToStaticMarkup(
			createElement(MonthlySummary, {
				period: "2026-08",
				summary: makeSummary({
					totalKnown: 2750,
					paid: 2500,
					remaining: 250,
					overdue: 100,
				}),
			}),
		);

		const normalized = normalizeMarkup(html);
		expect(normalized).toContain("R$ 2.750,00");
		expect(normalized).toContain("R$ 2.500,00");
		expect(normalized).toContain("R$ 250,00");
		expect(normalized).toContain("R$ 100,00");
	});
});
