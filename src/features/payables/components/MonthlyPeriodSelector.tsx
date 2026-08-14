"use client";

import {
	RiArrowLeftSLine,
	RiArrowRightSLine,
	RiCalendar2Line,
} from "@remixicon/react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { getNextPeriod, getPreviousPeriod } from "@/shared/utils/period";

export interface MonthlyPeriodSelectorProps {
	period: string;
	onPeriodChange: (period: string) => void;
}

function formatPeriodLabel(period: string): string {
	const [year, month] = period.split("-").map(Number);
	if (!year || !month) {
		return period;
	}

	const date = new Date(Date.UTC(year, month - 1, 1));
	return new Intl.DateTimeFormat("pt-BR", {
		month: "long",
		year: "numeric",
	}).format(date);
}

export function MonthlyPeriodSelector({
	period,
	onPeriodChange,
}: MonthlyPeriodSelectorProps) {
	return (
		<div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
			<div className="space-y-1">
				<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
					<RiCalendar2Line className="size-4 text-primary" />
					<span>Mês de vencimento</span>
				</div>
				<p className="text-sm text-muted-foreground">
					{formatPeriodLabel(period)} · veja contas que vencem neste mês e
					atrasadas ainda em aberto.
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={() => onPeriodChange(getPreviousPeriod(period))}
					aria-label="Mês anterior"
				>
					<RiArrowLeftSLine className="size-4" />
				</Button>
				<Input
					type="month"
					value={period}
					onChange={(event) => onPeriodChange(event.target.value)}
					className="min-w-[11rem]"
					aria-label="Selecionar competência"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={() => onPeriodChange(getNextPeriod(period))}
					aria-label="Próximo mês"
				>
					<RiArrowRightSLine className="size-4" />
				</Button>
			</div>
		</div>
	);
}
