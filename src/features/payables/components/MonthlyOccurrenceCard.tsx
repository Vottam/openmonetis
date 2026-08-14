"use client";

import {
	RiCheckboxCircleLine,
	RiClockwiseLine,
	RiInformationLine,
	RiMoneyDollarCircleLine,
} from "@remixicon/react";
import { CategoryIcon } from "@/features/categories/components/category-icon";
import {
	getOccurrenceDisplayStatus,
	type MonthlyPayableOccurrence,
} from "@/features/payables/lib/monthly-read-model";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";
import { formatFinancialDateLabel } from "@/shared/utils/financial-dates";
import { cn } from "@/shared/utils/ui";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
};

export interface MonthlyOccurrenceCardProps {
	item: MonthlyPayableOccurrence;
	onOpenDetails: () => void;
	onPay: () => void;
	onInformAmount: () => void;
}

export function MonthlyOccurrenceCard({
	item,
	onOpenDetails,
	onPay,
	onInformAmount,
}: MonthlyOccurrenceCardProps) {
	const status = getOccurrenceDisplayStatus(item.occurrence);
	const amountKnown =
		item.occurrence.expectedAmount ?? item.occurrence.actualAmount;
	const remaining = item.occurrence.remainingAmount;
	const showPayButton =
		item.occurrence.status === "pending" ||
		item.occurrence.status === "scheduled";
	const showPartialButton =
		item.occurrence.status === "partial" && (remaining ?? 0) > 0;
	const showInformAmount = item.occurrence.status === "awaiting_amount";

	// Detectar valor estimado: monthly_variable com expectedAmount mas sem actualAmount
	const isEstimated =
		item.payable.recurrenceType === "monthly_variable" &&
		item.occurrence.expectedAmount !== null &&
		item.occurrence.actualAmount === null;

	return (
		<Card className="overflow-hidden">
			<CardContent className="p-0">
				<div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
					<button
						type="button"
						className={cn("flex-1 text-left", "focus:outline-none")}
						onClick={onOpenDetails}
					>
						<div className="flex items-start gap-3">
							<div className="rounded-lg border bg-muted/30 p-2">
								<CategoryIcon
									name={item.payable.categoryIcon}
									className="size-5"
								/>
							</div>
							<div className="space-y-2">
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="text-base font-semibold">
										{item.payable.description}
									</h3>
									<Badge
										variant={
											item.occurrence.isOverdue ? "destructive" : "outline"
										}
									>
										{item.occurrence.status === "awaiting_amount"
											? "Aguardando valor"
											: item.occurrence.status === "partial"
												? "Parcial"
												: item.occurrence.status === "paid"
													? "Paga"
													: item.occurrence.status === "scheduled"
														? "Agendada"
														: "Pendente"}
									</Badge>
									{item.occurrence.isOverdue ? (
										<Badge variant="destructive">Vencida</Badge>
									) : null}
								</div>
								<p className="text-sm text-muted-foreground">
									Fornecedor: {item.payable.supplierName}
								</p>
								<p className="text-sm text-muted-foreground">
									Categoria: {item.payable.categoryName ?? "Sem categoria"}
								</p>
								<p className="text-sm text-muted-foreground">
									{formatFinancialDateLabel(
										item.occurrence.dueDate,
										"Vence em",
										DATE_FORMAT,
									)}
								</p>
								<div className="flex flex-wrap items-center gap-3 text-sm">
									<span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
										<RiMoneyDollarCircleLine className="size-4" />
										{amountKnown !== null
											? formatCurrency(amountKnown)
											: "Sem valor"}
										{isEstimated ? (
											<Badge variant="secondary" className="ml-1">
												Estimado
											</Badge>
										) : null}
									</span>
									{item.occurrence.status !== "awaiting_amount" ? (
										<span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
											<RiCheckboxCircleLine className="size-4" />
											Pago {formatCurrency(item.occurrence.paidAmount)}
										</span>
									) : null}
									{remaining !== null &&
									item.occurrence.status !== "awaiting_amount" ? (
										<span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
											<RiClockwiseLine className="size-4" />
											Restante {formatCurrency(remaining)}
										</span>
									) : null}
								</div>
							</div>
						</div>
					</button>

					<div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
						{showInformAmount ? (
							<Button type="button" variant="outline" onClick={onInformAmount}>
								<RiInformationLine className="size-4" />
								Informar valor
							</Button>
						) : null}
						{isEstimated ? (
							<Button
								type="button"
								variant="outline"
								onClick={onInformAmount}
								title="Informar valor real desta competência"
							>
								Atualizar valor
							</Button>
						) : null}
						{showPartialButton ? (
							<Button type="button" onClick={onPay}>
								Pagar restante
							</Button>
						) : null}
						{showPayButton ? (
							<Button type="button" onClick={onPay}>
								Pagar
							</Button>
						) : null}
						{status === "paid" ? (
							<Button type="button" variant="outline" disabled>
								Paga
							</Button>
						) : null}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
