import { useEffect, useState } from "react";

export type MonthlyPeriod = "2026-07" | "2026-08" | "2026-09";

/**
 * Hook para persistir a competência mensal na URL search params.
 *
 * Source of truth: URL search params (/payables?period=YYYY-MM)
 * NO localStorage, NO window.location.search no initializer.
 * Usa APIs canônicas do Next.js.
 *
 * @returns [currentPeriod, navigateToPeriod]
 */
export function useMonthlyPeriod(
	initial: MonthlyPeriod = "2026-08",
): [MonthlyPeriod, (period: MonthlyPeriod) => void] {
	// Extrai period da URL via URLSearchParams (API nativa, segura)
	const urlParams =
		typeof window !== "undefined"
			? new URLSearchParams(window.location.search)
			: new URLSearchParams();
	const savedPeriod = urlParams.get("period") as MonthlyPeriod | null;

	// Inicializa da URL, fallback para initial (mês atual)
	const [period, setPeriodState] = useState<MonthlyPeriod>(() => {
		if (savedPeriod) return savedPeriod;
		return initial;
	});

	// Atualiza URL quando period muda
	// pushState preservar back/forward e links diretos
	const updatePeriod = (newPeriod: MonthlyPeriod) => {
		setPeriodState(newPeriod);
		if (typeof window !== "undefined") {
			const params = new URLSearchParams(window.location.search);
			params.set("period", newPeriod);
			const newUrl = `${window.location.pathname}?${params.toString()}`;
			// Usa o histórico nativo de forma canônica
			window.history.pushState({ path: newUrl }, "", newUrl);
		}
	};

	return [period, updatePeriod];
}
