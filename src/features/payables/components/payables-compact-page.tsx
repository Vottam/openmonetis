"use client";

import {
	RiArrowLeftSLine,
	RiCalendarEventLine,
	RiHistoryLine,
	RiPencilLine,
} from "@remixicon/react";
import { CategoryIcon } from "@/features/categories/components/category-icon";
import {
	type MonthlyPayableOccurrence,
	type MonthlySummary,
} from "@/features/payables/lib/monthly-read-model";
import type { PayableOccurrence, PayableWithOccurrences } from "@/features/payables/lib/types";
import { MonthlyPeriodSelector } from "@/features/payables/components/MonthlyPeriodSelector";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { formatCurrency } from "@/shared/utils/currency";
import { formatFinancialDateLabel } from "@/shared/utils/financial-dates";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
};

function formatMonthLabel(period: string): string {
	const [year, month] = period.split("-").map(Number);
	if (!year || !month) return period;
	return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
		new Date(Date.UTC(year, month - 1, 1)),
	);
}

function lastPaymentDate(occurrence: PayableOccurrence): string | null {
	return occurrence.payments.at(-1)?.paidAt ?? null;
}

function statusBadges(occurrence: PayableOccurrence) {
	const badges: Array<{ label: string; variant: "default" | "outline" | "destructive" | "secondary" }> = [];

	switch (occurrence.status) {
		case "awaiting_amount":
			badges.push({ label: "Aguardando valor", variant: "secondary" });
			break;
		case "partial":
			badges.push({ label: "Parcial", variant: "default" });
			break;
		case "paid":
			badges.push({ label: "Paga", variant: "default" });
			break;
		case "scheduled":
			badges.push({ label: "Agendada", variant: "secondary" });
			break;
		default:
			badges.push({ label: occurrence.isOverdue ? "Vencida" : "Pendente", variant: occurrence.isOverdue ? "destructive" : "outline" });
	}

	if (occurrence.status === "partial" && occurrence.isOverdue) {
		badges.push({ label: "Vencida", variant: "destructive" });
	}

	return badges;
}

export function PayablesCompactPage({
	view,
	period,
	headerTitle,
	headerDescription,
	onPeriodChange,
	summary,
	occurrences,
	payables,
	onOpenOccurrenceDetails,
	onInformAmount,
	onPay,
	onOpenPayableDetails,
	onEditPayable,
	onCancelPayable,
	onDeletePayable,
	onOpenHistory,
}: {
	view: "operational" | "history";
	period: string;
	headerTitle?: string;
	headerDescription?: string;
	onPeriodChange?: (period: string) => void;
	summary: MonthlySummary;
	occurrences: MonthlyPayableOccurrence[];
	payables: PayableWithOccurrences[];
	onOpenOccurrenceDetails: (occurrence: PayableOccurrence) => void;
	onInformAmount: (occurrence: PayableOccurrence) => void;
	onPay: (occurrence: PayableOccurrence) => void;
	onOpenPayableDetails: (payable: PayableWithOccurrences) => void;
	onEditPayable: (payable: PayableWithOccurrences) => void;
	onCancelPayable: (payable: PayableWithOccurrences) => void;
	onDeletePayable: (payable: PayableWithOccurrences) => void;
	onOpenHistory?: (payable: MonthlyPayableOccurrence) => void;
}) {
	const titleText =
		headerTitle ??
		(view === "operational"
			? `Contas a Pagar — Vencimentos ${period}`
			: `Competências Mensais — ${formatMonthLabel(period)}`);
	const descriptionText =
		headerDescription ??
		(view === "operational"
			? "Tela operacional compacta baseada em vencimento real; competência e vencimento ficam em colunas distintas."
			: "Histórico completo por cadastro, exibindo todas as ocorrências materializadas.");

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<RiCalendarEventLine className="size-4 text-primary" />
						<span>Contas a pagar</span>
					</div>
					<h1 className="text-3xl font-bold tracking-tight">{titleText}</h1>
					<p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{descriptionText}</p>
				</div>
			</div>

			{view === "operational" && onPeriodChange ? (
				<MonthlyPeriodSelector period={period} onPeriodChange={onPeriodChange} />
			) : null}

			<div className="grid gap-3 sm:grid-cols-3">
				<SummaryCard label="Pago" value={formatCurrency(summary.paid)} />
				<SummaryCard label="A pagar" value={formatCurrency(summary.remaining)} />
				<SummaryCard label="Total" value={formatCurrency(summary.totalKnown)} />
			</div>

			<section className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<div>
						<h2 className="text-xl font-semibold">
							{view === "operational" ? "Visão operacional" : "Histórico completo"}
						</h2>
						<p className="text-sm text-muted-foreground">
							{view === "operational"
								? "Inclui vencimentos do mês selecionado e ocorrências anteriores ainda abertas."
								: "Mostra todas as ocorrências do payable selecionado, sem excluir o histórico."}
						</p>
					</div>
					<Badge variant="outline">{occurrences.length} item(ns)</Badge>
				</div>

				<div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Competência</TableHead>
								<TableHead>Título</TableHead>
								<TableHead>Categoria</TableHead>
								<TableHead>Valor</TableHead>
								<TableHead>Vencimento</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Data pagamento</TableHead>
								<TableHead className="text-right">Ações</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{occurrences.map((item) => {
								const occurrence = item.occurrence;
								const paymentDate = lastPaymentDate(occurrence);
								const badges = statusBadges(occurrence);
								return (
									<TableRow key={occurrence.id}>
										<TableCell className="whitespace-nowrap font-medium">{occurrence.period}</TableCell>
										<TableCell>
											<button type="button" className="text-left font-medium hover:underline" onClick={() => onOpenOccurrenceDetails(occurrence)}>
												{item.payable.description}
											</button>
											<div className="text-xs text-muted-foreground">{item.payable.supplierName}</div>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<CategoryIcon name={item.payable.categoryIcon} className="size-4" />
												<span>{item.payable.categoryName ?? "Sem categoria"}</span>
											</div>
										</TableCell>
										<TableCell>
											{occurrence.expectedAmount !== null
												? formatCurrency(occurrence.expectedAmount)
												: occurrence.status === "awaiting_amount"
													? "Aguardando valor"
													: "—"}
										</TableCell>
										<TableCell>{formatFinancialDateLabel(occurrence.dueDate, "", DATE_FORMAT)?.trim() ?? occurrence.dueDate}</TableCell>
										<TableCell>
											<div className="flex flex-wrap gap-1">
												{badges.map((badge) => (
													<Badge key={badge.label} variant={badge.variant}>{badge.label}</Badge>
												))}
											</div>
										</TableCell>
										<TableCell>{paymentDate ? (formatFinancialDateLabel(paymentDate, "", DATE_FORMAT)?.trim() ?? paymentDate) : "—"}</TableCell>
										<TableCell>
											<div className="flex justify-end gap-2">
												{onOpenHistory ? (
													<Button type="button" size="sm" variant="outline" onClick={() => onOpenHistory(item)}>
														<RiHistoryLine className="size-4" />
														Histórico
													</Button>
												) : null}
												{occurrence.status === "awaiting_amount" ? <Button type="button" size="sm" variant="outline" onClick={() => onInformAmount(occurrence)}>Informar valor</Button> : null}
												{occurrence.status === "pending" || occurrence.status === "partial" ? <Button type="button" size="sm" onClick={() => onPay(occurrence)}>{occurrence.status === "partial" && (occurrence.remainingAmount ?? 0) > 0 ? "Pagar restante" : "Pagar"}</Button> : null}
												<Button type="button" size="sm" variant="outline" onClick={() => onOpenOccurrenceDetails(occurrence)}>Detalhes</Button>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>

				<div className="grid gap-3 md:hidden">
					{occurrences.map((item) => {
						const occurrence = item.occurrence;
						const badges = statusBadges(occurrence);
						return (
							<Card key={occurrence.id} className="border-border/70">
								<CardContent className="space-y-3 p-4">
									<div className="flex items-start gap-3">
										<div className="rounded-lg border bg-muted/30 p-2">
											<CategoryIcon name={item.payable.categoryIcon} className="size-5" />
										</div>
										<div className="min-w-0 flex-1 space-y-2">
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="truncate text-base font-semibold">{item.payable.description}</h3>
												{badges.map((badge) => (
													<Badge key={badge.label} variant={badge.variant}>{badge.label}</Badge>
												))}
											</div>
											<p className="text-sm text-muted-foreground">{item.payable.supplierName}</p>
											<p className="text-sm text-muted-foreground">Competência {occurrence.period} · {formatFinancialDateLabel(occurrence.dueDate, "Vence em", DATE_FORMAT)}</p>
											<p className="text-sm text-muted-foreground">{item.payable.categoryName ?? "Sem categoria"}</p>
											<p className="text-sm font-medium">{occurrence.expectedAmount !== null ? formatCurrency(occurrence.expectedAmount) : occurrence.status === "awaiting_amount" ? "Aguardando valor" : "Sem valor"}</p>
										</div>
									</div>
									<div className="flex flex-wrap gap-2">
										{occurrence.status === "awaiting_amount" ? <Button type="button" variant="outline" size="sm" onClick={() => onInformAmount(occurrence)}>Informar valor</Button> : null}
										{occurrence.status === "pending" || occurrence.status === "partial" ? <Button type="button" size="sm" onClick={() => onPay(occurrence)}>{occurrence.status === "partial" && (occurrence.remainingAmount ?? 0) > 0 ? "Pagar restante" : "Pagar"}</Button> : null}
										<Button type="button" variant="outline" size="sm" onClick={() => onOpenOccurrenceDetails(occurrence)}>Detalhes</Button>
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</section>

			{view === "operational" ? (
				<section className="space-y-4">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h2 className="text-xl font-semibold">Cadastros de Contas a Pagar</h2>
							<p className="text-sm text-muted-foreground">Templates separados das ocorrências mensais.</p>
						</div>
						<Badge variant="outline">{payables.length} cadastro(s)</Badge>
					</div>

					<div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm lg:block">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Título</TableHead>
									<TableHead>Categoria</TableHead>
									<TableHead>Valor padrão</TableHead>
									<TableHead>Periodicidade</TableHead>
									<TableHead>Vencimento</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{payables.map((item) => (
									<TableRow key={item.payable.id}>
										<TableCell>
											<button type="button" className="font-medium hover:underline" onClick={() => onOpenPayableDetails(item)}>
												{item.payable.description}
											</button>
											<div className="text-xs text-muted-foreground">{item.payable.supplierName}</div>
										</TableCell>
										<TableCell>{item.payable.categoryName ?? "Sem categoria"}</TableCell>
										<TableCell>{item.payable.defaultAmount !== null ? formatCurrency(item.payable.defaultAmount) : "—"}</TableCell>
										<TableCell>{item.payable.recurrenceType}</TableCell>
										<TableCell>{formatFinancialDateLabel(item.payable.startsAt, "", DATE_FORMAT)?.trim() ?? item.payable.startsAt}</TableCell>
										<TableCell><Badge variant={item.payable.status === "active" ? "outline" : "destructive"}>{item.payable.status === "active" ? "Ativa" : "Cancelada"}</Badge></TableCell>
										<TableCell>
											<div className="flex justify-end gap-2">
												<Button type="button" variant="outline" size="sm" onClick={() => onEditPayable(item)}>
													<RiPencilLine className="size-4" />
													Editar cadastro
												</Button>
												<Button type="button" variant="outline" size="sm" onClick={() => onCancelPayable(item)}>Cancelar</Button>
												<Button type="button" variant="destructive" size="sm" onClick={() => onDeletePayable(item)}>Excluir</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</section>
			) : null}
		</div>
	);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
	return (
		<Card>
			<CardContent className="p-4">
				<p className="text-xs uppercase text-muted-foreground">{label}</p>
				<p className="text-xl font-semibold">{value}</p>
			</CardContent>
		</Card>
	);
}
