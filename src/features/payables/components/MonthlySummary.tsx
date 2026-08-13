"use client";

import type { MonthlySummary as MonthlySummaryData } from "@/features/payables/lib/monthly-read-model";
import { Progress } from "@/shared/components/ui/progress";
import { formatCurrency } from "@/shared/utils/currency";

export interface MonthlySummaryProps {
	period: string;
	summary: MonthlySummaryData;
}

export function MonthlySummary({ period, summary }: MonthlySummaryProps) {
	const progress =
		summary.totalKnown > 0 ? (summary.paid / summary.totalKnown) * 100 : 0;
	const safeProgress = Number.isFinite(progress)
		? Math.max(0, Math.min(progress, 100))
		: 0;
	const remainingLabel = formatCurrency(summary.remaining);
	const overdueLabel = formatCurrency(summary.overdue);
	const paidLabel = formatCurrency(summary.paid);
	const knownLabel = formatCurrency(summary.totalKnown);
	const awaitingLabel =
		summary.awaitingAmountCount === 0
			? "Nenhuma conta aguardando valor"
			: summary.awaitingAmountCount === 1
				? "1 conta aguardando valor"
				: `${summary.awaitingAmountCount} contas aguardando valor`;

	return (
		<section className="rounded-xl border bg-card p-4 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-1">
					<p className="text-sm font-medium text-muted-foreground">
						Resumo mensal
					</p>
					<h2 className="text-2xl font-semibold tracking-tight">{period}</h2>
					<p className="text-sm text-muted-foreground">
						Vencido é sempre um subconjunto do que ainda está a pagar.
					</p>
				</div>

				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<SummaryCard
						label="Total conhecido"
						value={knownLabel}
						helper="Soma das ocorrências com valor definido"
					/>
					<SummaryCard
						label="Pago"
						value={paidLabel}
						helper="Valores já quitados"
						tone="emerald"
					/>
					<SummaryCard
						label="A pagar"
						value={remainingLabel}
						helper="Saldo aberto do período"
						tone="blue"
					/>
					<SummaryCard
						label="Vencido"
						value={overdueLabel}
						helper="Saldo aberto em atraso"
						tone="rose"
					/>
				</div>
			</div>

			<div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
				<div>
					<div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
						<span>Progresso do mês</span>
						<span>{safeProgress.toFixed(0)}%</span>
					</div>
					<Progress value={safeProgress} className="h-2" />
				</div>
				<div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
					{awaitingLabel}
				</div>
			</div>
		</section>
	);
}

function SummaryCard({
	label,
	value,
	helper,
	tone,
}: {
	label: string;
	value: string;
	helper: string;
	tone?: "emerald" | "blue" | "rose";
}) {
	const toneClass =
		tone === "emerald"
			? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
			: tone === "blue"
				? "border-blue-500/20 bg-blue-500/10 text-blue-700"
				: tone === "rose"
					? "border-rose-500/20 bg-rose-500/10 text-rose-700"
					: "border-border bg-background text-foreground";

	return (
		<div className={`rounded-lg border p-3 ${toneClass}`}>
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className="mt-1 text-lg font-semibold">{value}</p>
			<p className="mt-1 text-xs text-muted-foreground">{helper}</p>
		</div>
	);
}
