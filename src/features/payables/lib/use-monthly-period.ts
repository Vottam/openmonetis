"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { getCurrentPeriod, parsePeriod } from "@/shared/utils/period";

function isValidPeriod(value: string | null | undefined): value is string {
	if (!value) {
		return false;
	}

	try {
		parsePeriod(value);
		return true;
	} catch {
		return false;
	}
}

export function useMonthlyPeriod(
	initialPeriod: string,
): [string, (period: string) => void] {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const normalizedInitial = isValidPeriod(initialPeriod)
		? initialPeriod
		: getCurrentPeriod();
	const urlPeriod = searchParams.get("period");
	const selectedPeriod = isValidPeriod(urlPeriod)
		? urlPeriod
		: normalizedInitial;

	useEffect(() => {
		if (!urlPeriod || isValidPeriod(urlPeriod)) {
			return;
		}

		const params = new URLSearchParams(searchParams.toString());
		params.set("period", normalizedInitial);
		router.replace(`${pathname}?${params.toString()}`, { scroll: false });
	}, [normalizedInitial, pathname, router, searchParams, urlPeriod]);

	const setPeriod = useCallback(
		(period: string) => {
			if (!isValidPeriod(period)) {
				return;
			}

			const params = new URLSearchParams(searchParams.toString());
			params.set("period", period);
			router.push(`${pathname}?${params.toString()}`, { scroll: false });
		},
		[pathname, router, searchParams],
	);

	return [selectedPeriod, setPeriod];
}
