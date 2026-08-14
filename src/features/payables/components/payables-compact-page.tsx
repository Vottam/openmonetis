"use client";

import {
	RiArrowLeftSLine,
	RiCalendarEventLine,
	RiDeleteBin5Line,
	RiEyeLine,
	RiMoneyDollarCircleLine,
	RiPencilLine,
	RiToggleLine,
} from "@remixicon/react";
import { CategoryIcon } from "@/features/categories/components/category-icon";
import { MonthlyPeriodSelector } from "@/features/payables/components/MonthlyPeriodSelector";
import type {
	MonthlyPayableOccurrence,
	MonthlySummary,
} from "@/features/payables/lib/monthly-read-model";
import type {
	PayableOccurrence,
	PayableWithOccurrences,
} from "@/features/payables/lib/types";
import {
	buildInformAmountInitialValue,
	buildPayableOccurrenceDetailFields,
	getDisplayedOccurrenceAmount,
	getOccurrenceActionVisibility,
	isEstimatedOccurrence,
	formatPayableRecurrenceLabel,
	formatPayableTemplatePeriod,
} from "@/features/payables/lib/page-ux";
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { formatCurrency } from "@/shared/utils/currency";
import { formatFinancialDateLabel } from "@/shared/utils/financial-dates";
import { cn } from "@/shared/utils/ui";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
};

function formatMonthLabel(period: string): string {
	const [year, month] = period.split("-").map(Number);
	if (!year || !month) return period;
	return new Intl.DateTimeFormat("pt-BR", {
		month: "long",
		year: "numeric",
	}).format(new Date(Date.UTC(year, month - 1, 1)));
}

function lastPaymentDate(occurrence: PayableOccurrence): string | null {
	return occurrence.payments.at(-1)?.paidAt ?? null;
}

function statusBadges(occurrence: PayableOccurrence) {
	const badges: Array<{
		label: string;
		variant: "default" | "outline" | "destructive" | "secondary" | "success" | "info";
		className?: string;
	}> = [];

	switch (occurrence.status) {
		case "awaiting_amount":
			badges.push({
				label: "Aguardando valor",
				variant: "secondary",
				className:
					"border-info/30 bg-info/10 text-info dark:border-info/40 dark:bg-info/15",
			});
			break;
		case "partial":
			badges.push({
				label: "Parcial",
				variant: "outline",
				className:
					"border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-950/40 dark:text-orange-200",
			});
			break;
		case "paid":
			badges.push({
				label: "Paga",
				variant: "success",
				className: "border-success/30 bg-success/10 text-success",
			});
			break;
		case "scheduled":
			badges.push({
				label: "Agendada",
				variant: "secondary",
				className: "border-slate-300 bg-slate-100 text-slate-700",
			});
			break;
		default:
			badges.push({
				label: occurrence.isOverdue ? "Vencida" : "Pendente",
				variant: occurrence.isOverdue ? "destructive" : "outline",
				className: occurrence.isOverdue
					? undefined
					: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200",
			});
	}

	if (occurrence.status === "partial" && occurrence.isOverdue) {
		badges.push({
			label: "Vencida",
			variant: "destructive",
		});
	}

	return badges;
}


function IconActionButton({
	label,
	icon,
	onClick,
	variant = "outline",
	className,
}: {
	label: string;
	icon: any;
	onClick: () => void;
	variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
	className?: string;
}) {
	const Icon = icon;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant={variant}
					size="icon-sm"
					className={cn("shrink-0", className)}
					onClick={onClick}
					aria-label={label}
				>
					<Icon className="size-4" aria-hidden />
					<span className="sr-only">{label}</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={8}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
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
	onEditOccurrence,
	onPay,
	onOpenPayableDetails,
	onEditPayable,
	onCancelPayable,
	onDeletePayable,
	onOpenPayableHistory,
}: {
	view: "operational" | "history";
	period: string;
	headerTitle?: string;
	headerDescription?: string;
	onPeriodChange?: (period: string) => void;
	summary: MonthlySummary;
	occurrences: MonthlyPayableOccurrence[];
	payables: PayableWithOccurrences[];
	onOpenOccurrenceDetails: (item: MonthlyPayableOccurrence) => void;
	onInformAmount: (item: MonthlyPayableOccurrence) => void;
	onEditOccurrence: (item: MonthlyPayableOccurrence) => void;
	onPay: (item: MonthlyPayableOccurrence) => void;
	onOpenPayableDetails: (payable: PayableWithOccurrences) => void;
	onEditPayable: (payable: PayableWithOccurrences) => void;
	onCancelPayable: (payable: PayableWithOccurrences) => void;
	onDeletePayable: (payable: PayableWithOccurrences) => void;
	onOpenPayableHistory?: (payable: PayableWithOccurrences) => void;
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
					<p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
						{descriptionText}
					</p>
				</div>
			</div>

			{view === "operational" && onPeriodChange ? (
				<MonthlyPeriodSelector
					period={period}
					onPeriodChange={onPeriodChange}
				/>
			) : null}

			<div className="grid gap-3 sm:grid-cols-3">
				<SummaryCard
					label="Pago"
					value={formatCurrency(summary.paid)}
					tone="success"
				/>
				<SummaryCard
					label="A pagar"
					value={formatCurrency(summary.remaining)}
					tone="warning"
				/>
				<SummaryCard
					label="Total"
					value={formatCurrency(summary.totalKnown)}
					tone="neutral"
				/>
			</div>

			<section className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<div>
						<h2 className="text-xl font-semibold">
							{view === "operational"
								? "Visão operacional"
								: "Histórico completo"}
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
								const actionVisibility = getOccurrenceActionVisibility(item, view);
								const displayedAmount = getDisplayedOccurrenceAmount(occurrence);
								const isEstimated = isEstimatedOccurrence(item.payable, occurrence);
								return (
									<TableRow key={occurrence.id}>
										<TableCell className="whitespace-nowrap font-medium">
											{occurrence.period}
										</TableCell>
										<TableCell>
											<button
												type="button"
												className="text-left font-medium hover:underline"
												onClick={() => onOpenOccurrenceDetails(item)}
											>
												{item.payable.description}
											</button>
											<div className="text-xs text-muted-foreground">
												{item.payable.supplierName}
											</div>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<CategoryIcon
													name={item.payable.categoryIcon}
													className="size-4"
												/>
												<span>
													{item.payable.categoryName ?? "Sem categoria"}
												</span>
											</div>
										</TableCell>
										<TableCell>
											{displayedAmount !== null ? (
												<>
													{formatCurrency(displayedAmount)}
													{isEstimated ? (
														<Badge variant="secondary" className="ml-1">
															Estimado
														</Badge>
													) : null}
												</>
											) : occurrence.status === "awaiting_amount" ? (
												"Aguardando valor"
											) : (
												"—"
											)}
										</TableCell>
										<TableCell>
											{formatFinancialDateLabel(
												occurrence.dueDate,
												"",
												DATE_FORMAT,
											)?.trim() ?? occurrence.dueDate}
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap gap-1">
												{badges.map((badge) => (
													<Badge key={badge.label} variant={badge.variant} className={badge.className}>
														{badge.label}
													</Badge>
												))}
											</div>
										</TableCell>
										<TableCell>
											{paymentDate
												? (formatFinancialDateLabel(
														paymentDate,
														"",
														DATE_FORMAT,
													)?.trim() ?? paymentDate)
												: "—"}
										</TableCell>
										<TableCell>
											<div className="flex justify-end gap-1.5">
												{actionVisibility.showDetails ? (
													<IconActionButton
														label="Ver competências"
														icon={RiEyeLine}
														onClick={() => onOpenOccurrenceDetails(item)}
													/>
												) : null}
												{actionVisibility.showInformAmount ? (
													<IconActionButton
														label={
															isEstimated
																? "Informar valor real desta competência"
																: "Informar valor desta competência"
														}
														icon={RiPencilLine}
														onClick={() => onInformAmount(item)}
													/>
												) : null}
												<IconActionButton
													label="Editar esta competência"
													icon={RiPencilLine}
													onClick={() => onEditOccurrence(item)}
												/>
												{actionVisibility.showPay ? (
													<IconActionButton
														label={
															item.occurrence.status === "partial" &&
															(occurrence.remainingAmount ?? 0) > 0
																? "Pagar restante"
																: "Pagar"
														}
														icon={RiMoneyDollarCircleLine}
														variant="default"
														className="bg-orange-500 text-white hover:bg-orange-600 focus-visible:ring-orange-500/30 dark:bg-orange-500 dark:hover:bg-orange-600"
														onClick={() => onPay(item)}
													/>
												) : null}
												<IconActionButton
													label="Detalhes"
													icon={RiEyeLine}
													onClick={() => onOpenOccurrenceDetails(item)}
												/>
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
						const actionVisibility = getOccurrenceActionVisibility(item, view);
						const displayedAmount = getDisplayedOccurrenceAmount(occurrence);
						const isEstimated = isEstimatedOccurrence(item.payable, occurrence);
						return (
							<Card key={occurrence.id} className="border-border/70">
								<CardContent className="space-y-3 p-4">
									<div className="flex items-start gap-3">
										<div className="rounded-lg border bg-muted/30 p-2">
											<CategoryIcon
												name={item.payable.categoryIcon}
												className="size-5"
											/>
										</div>
										<div className="min-w-0 flex-1 space-y-2">
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="truncate text-base font-semibold">
													{item.payable.description}
												</h3>
												{badges.map((badge) => (
													<Badge key={badge.label} variant={badge.variant} className={badge.className}>
														{badge.label}
													</Badge>
												))}
											</div>
											<p className="text-sm text-muted-foreground">
												{item.payable.supplierName}
											</p>
											<p className="text-sm text-muted-foreground">
												Competência {occurrence.period} ·{" "}
												{formatFinancialDateLabel(
													occurrence.dueDate,
													"Vence em",
													DATE_FORMAT,
												)}
											</p>
											<p className="text-sm text-muted-foreground">
												{item.payable.categoryName ?? "Sem categoria"}
											</p>
											<p className="text-sm font-medium">
												{displayedAmount !== null ? (
													<>
														{formatCurrency(displayedAmount)}
														{isEstimated ? (
															<Badge variant="secondary" className="ml-1">
																Estimado
															</Badge>
														) : null}
													</>
												) : occurrence.status === "awaiting_amount" ? (
													"Aguardando valor"
												) : (
													"Sem valor"
												)}
											</p>
										</div>
									</div>
									<div className="flex flex-wrap gap-2">
										{actionVisibility.showDetails ? (
											<IconActionButton
												label="Ver competências"
												icon={RiEyeLine}
												onClick={() => onOpenOccurrenceDetails(item)}
											/>
										) : null}
										{actionVisibility.showInformAmount ? (
											<IconActionButton
												label={
													isEstimated
														? "Informar valor real desta competência"
														: "Informar valor desta competência"
												}
												icon={RiPencilLine}
												onClick={() => onInformAmount(item)}
											/>
										) : null}
										<IconActionButton
											label="Editar esta competência"
											icon={RiPencilLine}
											onClick={() => onEditOccurrence(item)}
										/>
										{actionVisibility.showPay ? (
											<IconActionButton
												label={
													item.occurrence.status === "partial" &&
													(occurrence.remainingAmount ?? 0) > 0
														? "Pagar restante"
														: "Pagar"
												}
												icon={RiMoneyDollarCircleLine}
												variant="default"
												className="bg-orange-500 text-white hover:bg-orange-600 focus-visible:ring-orange-500/30 dark:bg-orange-500 dark:hover:bg-orange-600"
												onClick={() => onPay(item)}
											/>
										) : null}
										<IconActionButton
											label="Detalhes"
											icon={RiEyeLine}
											onClick={() => onOpenOccurrenceDetails(item)}
										/>
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
							<h2 className="text-xl font-semibold">
								Cadastros de Contas a Pagar
							</h2>
							<p className="text-sm text-muted-foreground">
								Templates separados das ocorrências mensais.
							</p>
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
											<button
												type="button"
												className="font-medium hover:underline"
												onClick={() => onOpenPayableDetails(item)}
											>
												{item.payable.description}
											</button>
											<div className="text-xs text-muted-foreground">
												{item.payable.supplierName}
											</div>
										</TableCell>
										<TableCell>
											{item.payable.categoryName ?? "Sem categoria"}
										</TableCell>
										<TableCell>
											{item.payable.defaultAmount !== null
												? formatCurrency(item.payable.defaultAmount)
												: "—"}
										</TableCell>
										<TableCell>
						<div className="space-y-1">
							<div className="font-medium">
								{formatPayableRecurrenceLabel(item.payable.recurrenceType)}
							</div>
							<div className="text-xs text-muted-foreground">
								{formatPayableTemplatePeriod(item.payable)}
							</div>
						</div>
					</TableCell>
										<TableCell>
											{formatFinancialDateLabel(
												item.payable.startsAt,
												"",
												DATE_FORMAT,
											)?.trim() ?? item.payable.startsAt}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													item.payable.status === "active"
														? "outline"
														: "destructive"
												}
											>
												{item.payable.status === "active"
													? "Ativa"
													: "Cancelada"}
											</Badge>
										</TableCell>
										<TableCell>
											<div className="flex justify-end gap-2">
												{onOpenPayableHistory ? (
													<IconActionButton
														label="Ver competências"
														icon={RiCalendarEventLine}
														onClick={() => onOpenPayableHistory(item)}
													/>
												) : null}
												<IconActionButton
													label="Editar cadastro"
													icon={RiPencilLine}
													onClick={() => onEditPayable(item)}
												/>
												<IconActionButton
													label={item.payable.status === "active" ? "Inativar" : "Ativar"}
													icon={RiToggleLine}
													onClick={() => onCancelPayable(item)}
													variant="outline"
												/>
												<IconActionButton
													label="Excluir"
													icon={RiDeleteBin5Line}
													onClick={() => onDeletePayable(item)}
													variant="destructive"
												/>
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

function SummaryCard({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: string;
	tone?: "success" | "warning" | "neutral";
}) {
	const toneClasses =
		tone === "success"
			? "border-l-success/70 bg-success/5"
			: tone === "warning"
				? "border-l-amber-500/70 bg-amber-500/5"
				: "border-l-slate-400/70 bg-slate-500/5";
	const valueClasses =
		tone === "success"
			? "text-success"
			: tone === "warning"
				? "text-amber-700 dark:text-amber-200"
				: "text-slate-700 dark:text-slate-200";

	return (
		<Card className={cn("border-l-4", toneClasses)}>
			<CardContent className="p-4">
				<p className="text-xs uppercase text-muted-foreground">{label}</p>
				<p className={cn("text-xl font-semibold", valueClasses)}>{value}</p>
			</CardContent>
		</Card>
	);
}