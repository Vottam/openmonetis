"use client";

import {
	RiBankLine,
	RiCheckLine,
	RiHandCoinLine,
	RiListCheck3,
	RiMoneyDollarCircleLine,
	RiRefundLine,
	RiTimeLine,
} from "@remixicon/react";
import type { ReactNode } from "react";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate, formatDateTime } from "@/shared/utils/date";

import type { LoanDashboardAccount } from "../lib/dashboard";

function getLoanKindLabel(loanType: LoanDashboardAccount["loanType"]) {
	return loanType === "revolving" ? "Crédito rotativo" : "Empréstimo fixo";
}

function getInstallmentStatusLabel(status: string) {
	switch (status) {
		case "paid":
			return "Paga";
		case "partial":
			return "Parcial";
		case "overdue":
			return "Atrasada";
		default:
			return "Pendente";
	}
}

function getStatusVariant(status: string) {
	switch (status) {
		case "paid":
			return "success";
		case "partial":
			return "info";
		case "overdue":
			return "destructive";
		default:
			return "outline";
	}
}

function MetricCard({
	label,
	value,
	description,
}: {
	label: string;
	value: string;
	description?: string;
}) {
	return (
		<div className="rounded-xl border bg-muted/20 p-4 shadow-sm">
			<div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
			{description ? (
				<div className="mt-1 text-xs text-muted-foreground">{description}</div>
			) : null}
		</div>
	);
}

function MetricPill({
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

function summarizeInstallment(
	account: LoanDashboardAccount,
	installmentId: string,
) {
	const installment = account.installments.find(
		(item) => item.id === installmentId,
	);
	if (!installment) {
		return null;
	}

	const payments = account.payments.filter(
		(payment) => payment.installmentId === installmentId,
	);
	const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
	const paidPrincipal = payments.reduce(
		(sum, payment) => sum + payment.principalPaid,
		0,
	);
	const paidInterest = payments.reduce(
		(sum, payment) => sum + payment.interestPaid,
		0,
	);
	const paidCharge = payments.reduce(
		(sum, payment) => sum + payment.chargePaid,
		0,
	);
	const expectedCharge = Math.max(
		0,
		installment.expectedValue -
			installment.expectedPrincipal -
			installment.expectedInterest,
	);
	const remainingAmount = Math.max(0, installment.expectedValue - paidAmount);
	const remainingPrincipal = Math.max(
		0,
		installment.expectedPrincipal - paidPrincipal,
	);
	const remainingInterest = Math.max(
		0,
		installment.expectedInterest - paidInterest,
	);
	const remainingCharge = Math.max(0, expectedCharge - paidCharge);
	const isPastDue = installment.dueDate < new Date().toISOString().slice(0, 10);
	const status =
		installment.status === "paid"
			? "paid"
			: installment.status === "partial" || paidAmount > 0
				? remainingAmount <= 0
					? "paid"
					: "partial"
				: isPastDue
					? "overdue"
					: "pending";

	return {
		installment,
		payments,
		paidAmount,
		paidPrincipal,
		paidInterest,
		paidCharge,
		expectedCharge,
		remainingAmount,
		remainingPrincipal,
		remainingInterest,
		remainingCharge,
		status,
	};
}

function InstallmentRow({
	account,
	installmentId,
	onRegisterPayment,
}: {
	account: LoanDashboardAccount;
	installmentId: string;
	onRegisterPayment?: (installmentId: string) => void;
}) {
	const summary = summarizeInstallment(account, installmentId);
	if (!summary) return null;

	const { installment, status } = summary;
	return (
		<div className="rounded-xl border bg-card p-4 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<Badge variant={getStatusVariant(status)}>
							{getInstallmentStatusLabel(status)}
						</Badge>
						<span className="text-sm font-semibold text-foreground">
							Parcela {installment.installmentNumber}
						</span>
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						Vencimento {formatDate(installment.dueDate)}
					</p>
				</div>
				<div className="text-right">
					<div className="text-xs uppercase tracking-wide text-muted-foreground">
						Valor previsto
					</div>
					<div className="text-base font-semibold">
						{formatCurrency(installment.expectedValue)}
					</div>
				</div>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<MetricCard
					label="Principal"
					value={formatCurrency(installment.expectedPrincipal)}
				/>
				<MetricCard
					label="Juros"
					value={formatCurrency(installment.expectedInterest)}
				/>
				<MetricCard
					label="Encargos"
					value={formatCurrency(summary.expectedCharge)}
				/>
				<MetricCard label="Pago" value={formatCurrency(summary.paidAmount)} />
			</div>

			<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
				<div className="space-y-1">
					<div>
						Restante principal: {formatCurrency(summary.remainingPrincipal)}
					</div>
					<div>Restante juros: {formatCurrency(summary.remainingInterest)}</div>
					<div>
						Restante encargos: {formatCurrency(summary.remainingCharge)}
					</div>
				</div>
				{onRegisterPayment ? (
					<Button
						type="button"
						variant={status === "paid" ? "outline" : "default"}
						disabled={status === "paid"}
						onClick={() => onRegisterPayment(installment.id)}
					>
						{status === "paid" ? "Parcela quitada" : "Registrar pagamento"}
					</Button>
				) : null}
			</div>
		</div>
	);
}

function PaymentRow({
	payment,
}: {
	payment: LoanDashboardAccount["payments"][number];
}) {
	return (
		<div className="rounded-xl border bg-card p-4 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<Badge variant={getStatusVariant(payment.status)}>
							{getInstallmentStatusLabel(payment.status)}
						</Badge>
						<span className="text-sm font-semibold text-foreground">
							Parcela {payment.installmentNumber}
						</span>
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						Pago em {formatDateTime(payment.paidAt) ?? "—"}
					</p>
				</div>
				<div className="text-right">
					<div className="text-xs uppercase tracking-wide text-muted-foreground">
						Total pago
					</div>
					<div className="text-base font-semibold">
						{formatCurrency(payment.amount)}
					</div>
				</div>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-3">
				<MetricCard
					label="Principal"
					value={formatCurrency(payment.principalPaid)}
				/>
				<MetricCard
					label="Juros"
					value={formatCurrency(payment.interestPaid)}
				/>
				<MetricCard
					label="Encargos"
					value={formatCurrency(payment.chargePaid)}
				/>
			</div>
		</div>
	);
}

export function LoanDetailPanel({
	account,
	onCreateOperation,
	onRegisterPayment,
}: {
	account: LoanDashboardAccount | null;
	onCreateOperation?: () => void;
	onRegisterPayment?: (installmentId: string) => void;
}) {
	if (!account) {
		return (
			<Card className="h-full">
				<EmptyState
					className="min-h-[480px] max-w-none"
					media={<RiBankLine className="size-6 text-primary" />}
					title="Selecione uma linha para ver os detalhes"
					description="Abra um cartão de empréstimo para acompanhar operações, parcelas e pagamentos."
				>
					{onCreateOperation ? (
						<Button type="button" onClick={onCreateOperation}>
							Nova operação
						</Button>
					) : null}
				</EmptyState>
			</Card>
		);
	}

	const balanceDue = Math.max(
		0,
		account.summary.totalPayable - account.summary.totalPaid,
	);
	const isRevolving = account.loanType === "revolving";

	return (
		<Card className="h-full border-primary/10 shadow-sm">
			<CardHeader className="space-y-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<RiBankLine className="size-5 text-primary" />
							<CardTitle className="text-xl">
								{account.institutionName}
							</CardTitle>
						</div>
						<CardDescription>
							{getLoanKindLabel(account.loanType)} · {account.operations.length}{" "}
							operação(ões)
						</CardDescription>
					</div>
					<div className="flex flex-col items-end gap-2">
						<Badge variant={isRevolving ? "info" : "secondary"}>
							{isRevolving ? "CRÉDITO ROTATIVO" : "EMPRÉSTIMO FIXO"}
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
							{account.summary.status === "paid"
								? "QUITADO"
								: account.summary.status === "overdue"
									? "ATRASADO"
									: account.summary.status === "cancelled"
										? "CANCELADO"
										: "ATIVO"}
						</Badge>
					</div>
				</div>

				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{isRevolving ? (
						<>
							<MetricPill
								label="Limite concedido"
								value={formatCurrency(account.summary.limit)}
								icon={<RiRefundLine className="size-4" />}
							/>
							<MetricPill
								label="Disponível"
								value={formatCurrency(account.summary.available)}
								icon={<RiCheckLine className="size-4" />}
							/>
							<MetricPill
								label="Utilizado"
								value={formatCurrency(account.summary.utilized)}
								icon={<RiMoneyDollarCircleLine className="size-4" />}
							/>
							<MetricPill
								label="Saldo a pagar"
								value={formatCurrency(balanceDue)}
								icon={<RiBankLine className="size-4" />}
							/>
							<MetricPill
								label="Próxima parcela"
								value={formatCurrency(account.summary.nextPayment)}
								icon={<RiHandCoinLine className="size-4" />}
							/>
							<MetricPill
								label="Operações ativas"
								value={String(account.summary.activeOperations)}
								icon={<RiListCheck3 className="size-4" />}
							/>
						</>
					) : (
						<>
							<MetricPill
								label="Valor recebido"
								value={formatCurrency(account.summary.amountReceived)}
								icon={<RiMoneyDollarCircleLine className="size-4" />}
							/>
							<MetricPill
								label="Total contratado"
								value={formatCurrency(account.summary.totalContracted)}
								icon={<RiRefundLine className="size-4" />}
							/>
							<MetricPill
								label="Já pago"
								value={formatCurrency(account.summary.totalPaid)}
								icon={<RiCheckLine className="size-4" />}
							/>
							<MetricPill
								label="Saldo a pagar"
								value={formatCurrency(balanceDue)}
								icon={<RiBankLine className="size-4" />}
							/>
							<MetricPill
								label="Principal restante"
								value={formatCurrency(account.summary.remainingPrincipal)}
								icon={<RiHandCoinLine className="size-4" />}
							/>
							<MetricPill
								label="Próximo vencimento"
								value={formatDate(account.summary.nextDueDate)}
								icon={<RiTimeLine className="size-4" />}
							/>
						</>
					)}
				</div>

				<div className="flex flex-wrap gap-2">
					<Button type="button" onClick={onCreateOperation}>
						Nova operação
					</Button>
					<Button type="button" variant="outline" onClick={onCreateOperation}>
						Alterar limite / editar operação
					</Button>
				</div>
			</CardHeader>

			<CardContent className="space-y-6 pt-0">
				<Tabs defaultValue="visao-geral" className="w-full">
					<TabsList className="grid w-full grid-cols-4">
						<TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
						<TabsTrigger value="operacoes">Operações</TabsTrigger>
						<TabsTrigger value="parcelas">Parcelas</TabsTrigger>
						<TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
					</TabsList>

					<TabsContent value="visao-geral" className="mt-4 space-y-4">
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							<MetricCard
								label="Juros restantes"
								value={formatCurrency(account.summary.remainingInterest)}
								description="Não recompõe limite"
							/>
							<MetricCard
								label="Encargos restantes"
								value={formatCurrency(account.summary.remainingCharge)}
								description="Tarifas e custos acessórios"
							/>
							<MetricCard
								label="Total a pagar"
								value={formatCurrency(balanceDue)}
								description="Principal + juros + encargos"
							/>
							<MetricCard
								label="Parcelas pagas"
								value={`${account.summary.paidInstallmentCount} / ${account.summary.installmentCount}`}
								description="Cronograma atual"
							/>
							<MetricCard
								label="Último pagamento"
								value={formatDate(account.summary.lastPaymentDate)}
								description="Atualização mais recente"
							/>
							<MetricCard
								label="Operações ativas"
								value={String(account.summary.activeOperations)}
								description="Operações vinculadas à linha"
							/>
						</div>
					</TabsContent>

					<TabsContent value="operacoes" className="mt-4 space-y-3">
						{account.operations.map((operation) => (
							<div
								key={operation.id}
								className="rounded-xl border bg-card p-4 shadow-sm"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<div className="flex items-center gap-2">
											<Badge variant={getStatusVariant(operation.status)}>
												{operation.status === "paid"
													? "Quitada"
													: operation.status === "overdue"
														? "Em atraso"
														: operation.status === "cancelled"
															? "Cancelada"
															: "Ativa"}
											</Badge>
											<span className="text-sm font-semibold">
												Operação {operation.id.slice(0, 8)}
											</span>
										</div>
										<p className="mt-1 text-sm text-muted-foreground">
											Início {formatDate(operation.startDate)} · Próximo
											vencimento {formatDate(operation.nextDueDate)}
										</p>
									</div>
									<div className="text-right text-sm text-muted-foreground">
										<div>
											Parcela atual {operation.currentInstallment} /{" "}
											{operation.totalInstallments}
										</div>
										<div className="font-medium text-foreground">
											Total a pagar: {formatCurrency(operation.totalPayable)}
										</div>
									</div>
								</div>
								<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
									<MetricCard
										label="Principal tomado"
										value={formatCurrency(operation.principalBorrowed)}
									/>
									<MetricCard
										label="Valor recebido"
										value={formatCurrency(operation.amountReceived)}
									/>
									<MetricCard
										label="Total contratado"
										value={formatCurrency(operation.totalContracted)}
									/>
									<MetricCard
										label="Total a pagar"
										value={formatCurrency(operation.totalPayable)}
									/>
								</div>
							</div>
						))}
					</TabsContent>

					<TabsContent value="parcelas" className="mt-4 space-y-3">
						{account.installments.length === 0 ? (
							<Card className="border-dashed">
								<EmptyState
									className="min-h-[220px] max-w-none"
									media={<RiRefundLine className="size-6 text-primary" />}
									title="Nenhuma parcela cadastrada"
									description="Crie uma operação para gerar o cronograma de parcelas."
								>
									{onCreateOperation ? (
										<Button type="button" onClick={onCreateOperation}>
											Nova operação
										</Button>
									) : null}
								</EmptyState>
							</Card>
						) : (
							account.installments.map((installment) => (
								<InstallmentRow
									key={installment.id}
									account={account}
									installmentId={installment.id}
									onRegisterPayment={onRegisterPayment}
								/>
							))
						)}
					</TabsContent>

					<TabsContent value="pagamentos" className="mt-4 space-y-3">
						{account.payments.length === 0 ? (
							<Card className="border-dashed">
								<EmptyState
									className="min-h-[220px] max-w-none"
									media={
										<RiMoneyDollarCircleLine className="size-6 text-primary" />
									}
									title="Nenhum pagamento registrado"
									description="Quando um pagamento for salvo, ele aparecerá aqui com principal, juros e encargos."
								/>
							</Card>
						) : (
							account.payments.map((payment) => (
								<PaymentRow key={payment.id} payment={payment} />
							))
						)}
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
