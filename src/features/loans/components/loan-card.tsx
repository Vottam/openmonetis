"use client";

import {
	RiBankLine,
	RiMoneyDollarCircleLine,
	RiRefundLine,
	RiTimeLine,
} from "@remixicon/react";
import type { ReactNode } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

import type { LoanDashboardAccount } from "../lib/dashboard";

function getLoanKindLabel(loanType: LoanDashboardAccount["loanType"]) {
	return loanType === "revolving" ? "CRÉDITO ROTATIVO" : "EMPRÉSTIMO FIXO";
}

function getStatusLabel(account: LoanDashboardAccount) {
	if (account.summary.status === "paid") {
		return "Quitado";
	}

	if (account.summary.status === "overdue") {
		return "Em atraso";
	}

	if (account.summary.status === "cancelled") {
		return "Cancelado";
	}

	return "Ativo";
}

function Metric({
	label,
	value,
	description,
}: {
	label: string;
	value: string;
	description?: string;
}) {
	return (
		<div className="rounded-xl border bg-muted/20 p-3">
			<div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 text-base font-semibold text-foreground">
				{value}
			</div>
			{description ? (
				<div className="mt-1 text-xs text-muted-foreground">{description}</div>
			) : null}
		</div>
	);
}

function SummaryValue({
	label,
	value,
	icon,
}: {
	label: string;
	value: string;
	icon?: ReactNode;
}) {
	return (
		<div className="rounded-xl border bg-card p-3 shadow-sm">
			<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
				{icon}
				<span>{label}</span>
			</div>
			<div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
		</div>
	);
}

export function LoanCard({
	account,
	selected = false,
	onSelect,
	onCreateOperation,
}: {
	account: LoanDashboardAccount;
	selected?: boolean;
	onSelect?: () => void;
	onCreateOperation?: () => void;
}) {
	const balanceDue = Math.max(
		0,
		account.summary.totalPayable - account.summary.totalPaid,
	);

	return (
		<Card
			className={cn(
				"overflow-hidden border bg-card/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
				selected && "border-primary/50 ring-2 ring-primary/20 shadow-md",
			)}
		>
			<CardHeader className="space-y-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<RiBankLine className="size-5 text-primary" />
							<CardTitle className="text-base font-semibold">
								{account.institutionName}
							</CardTitle>
						</div>
						<CardDescription className="text-sm text-muted-foreground">
							{account.institution.type === "bank" ? "Banco" : "Outros"}
							{account.institution.description
								? ` · ${account.institution.description}`
								: ""}
						</CardDescription>
					</div>
					<div className="flex flex-col items-end gap-2">
						<Badge
							variant={account.loanType === "revolving" ? "info" : "secondary"}
						>
							{getLoanKindLabel(account.loanType)}
						</Badge>
						<Badge
							variant={
								account.summary.status === "overdue"
									? "destructive"
									: account.summary.status === "paid"
										? "success"
										: account.summary.status === "cancelled"
											? "outline"
											: "default"
							}
						>
							{getStatusLabel(account)}
						</Badge>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{account.loanType === "revolving" ? (
						<>
							<Metric
								label="Limite total"
								value={formatCurrency(account.summary.limit)}
								description="Crédito concedido à linha"
							/>
							<Metric
								label="Disponível"
								value={formatCurrency(account.summary.available)}
								description="Recomposto apenas pelo principal amortizado"
							/>
							<Metric
								label="Utilizado"
								value={formatCurrency(account.summary.utilized)}
								description="Principal atualmente em aberto"
							/>
							<Metric
								label="Saldo a pagar"
								value={formatCurrency(balanceDue)}
								description="Principal + juros + encargos restantes"
							/>
						</>
					) : (
						<>
							<Metric
								label="Valor recebido"
								value={formatCurrency(account.summary.amountReceived)}
								description="Valor líquido efetivamente disponibilizado"
							/>
							<Metric
								label="Total contratado"
								value={formatCurrency(account.summary.totalContracted)}
								description="Montante do empréstimo contratado"
							/>
							<Metric
								label="Já pago"
								value={formatCurrency(account.summary.totalPaid)}
								description="Pagamentos já registrados"
							/>
							<Metric
								label="Saldo a pagar"
								value={formatCurrency(balanceDue)}
								description="Dívida total remanescente"
							/>
						</>
					)}
				</div>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<SummaryValue
						label="Próximo vencimento"
						value={formatDate(account.summary.nextDueDate)}
						icon={<RiTimeLine className="size-4" />}
					/>
					<SummaryValue
						label="Parcelas"
						value={`${account.summary.paidInstallmentCount} / ${account.summary.installmentCount}`}
						icon={<RiRefundLine className="size-4" />}
					/>
					<SummaryValue
						label="Pagamentos"
						value={formatCurrency(account.summary.totalPaid)}
						icon={<RiMoneyDollarCircleLine className="size-4" />}
					/>
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				<div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
					<Button
						type="button"
						variant={selected ? "default" : "outline"}
						onClick={onSelect}
						className="w-full sm:w-auto"
					>
						Ver detalhes
					</Button>
					<Button
						type="button"
						onClick={onCreateOperation}
						className="w-full sm:w-auto"
					>
						Nova operação
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export function LoanAccountCard(props: {
	account: LoanDashboardAccount;
	selected?: boolean;
	onSelect?: () => void;
	onCreateOperation?: () => void;
}) {
	return <LoanCard {...props} />;
}
