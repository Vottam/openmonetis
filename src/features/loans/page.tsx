"use client";

import {
	RiAddLine,
	RiBankLine,
	RiHandCoinLine,
	RiMoneyDollarCircleLine,
	RiRefundLine,
} from "@remixicon/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";

import { LoanCard } from "./components/loan-card";
import { LoanDetailPanel } from "./components/loan-detail";
import { LoanInstitutionDialog } from "./components/loan-institution-dialog";
import { LoanOperationDialog } from "./components/loan-operation-dialog";
import { LoanPaymentDialog } from "./components/loan-payment-dialog";
import type { LoanDashboardAccount, LoanDashboardData } from "./lib/dashboard";

function OverviewCard({
	label,
	value,
	description,
	icon,
}: {
	label: string;
	value: string;
	description?: string;
	icon?: ReactNode;
}) {
	return (
		<Card className="shadow-sm">
			<CardHeader className="space-y-2">
				<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
					{icon}
					<span>{label}</span>
				</div>
				<CardTitle className="text-2xl">{value}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
		</Card>
	);
}

function LoansGroupSection({
	title,
	description,
	accounts,
	selectedAccountId,
	onSelectAccount,
	onCreateOperation,
}: {
	title: string;
	description: string;
	accounts: LoanDashboardAccount[];
	selectedAccountId: string | null;
	onSelectAccount: (accountId: string) => void;
	onCreateOperation: (account: LoanDashboardAccount) => void;
}) {
	if (accounts.length === 0) {
		return (
			<Card className="border-dashed bg-background/60">
				<EmptyState
					className="min-h-[240px] max-w-none"
					media={<RiBankLine className="size-6 text-primary" />}
					title={title}
					description={description}
				>
					<p className="text-sm text-muted-foreground">
						Ainda não há linhas cadastradas nesta modalidade.
					</p>
				</EmptyState>
			</Card>
		);
	}

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold">{title}</h2>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				<Badge variant="outline">{accounts.length} linha(s)</Badge>
			</div>

			<div className="grid gap-4 xl:grid-cols-1 2xl:grid-cols-2">
				{accounts.map((account) => (
					<LoanCard
						key={account.id}
						account={account}
						selected={selectedAccountId === account.id}
						onSelect={() => onSelectAccount(account.id)}
						onCreateOperation={() => onCreateOperation(account)}
					/>
				))}
			</div>
		</section>
	);
}

export function LoansPage({ dashboard }: { dashboard: LoanDashboardData }) {
	const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
		dashboard.defaultAccountId,
	);
	const [institutionDialogOpen, setInstitutionDialogOpen] = useState(false);
	const [operationDialogOpen, setOperationDialogOpen] = useState(false);
	const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
	const [operationDefaults, setOperationDefaults] = useState<{
		institutionId?: string | null;
		loanType?: "revolving" | "fixed";
	}>({});
	const [paymentTarget, setPaymentTarget] = useState<{
		accountId: string;
		installmentId: string;
	} | null>(null);

	useEffect(() => {
		if (!dashboard.accounts.length) {
			setSelectedAccountId(null);
			return;
		}

		if (
			!selectedAccountId ||
			!dashboard.accounts.some((account) => account.id === selectedAccountId)
		) {
			setSelectedAccountId(
				dashboard.defaultAccountId ?? dashboard.accounts[0]?.id ?? null,
			);
		}
	}, [dashboard.accounts, dashboard.defaultAccountId, selectedAccountId]);

	const selectedAccount = useMemo(
		() =>
			dashboard.accounts.find((account) => account.id === selectedAccountId) ??
			null,
		[dashboard.accounts, selectedAccountId],
	);

	const revolvingAccounts = useMemo(
		() =>
			dashboard.accounts.filter((account) => account.loanType === "revolving"),
		[dashboard.accounts],
	);
	const fixedAccounts = useMemo(
		() => dashboard.accounts.filter((account) => account.loanType === "fixed"),
		[dashboard.accounts],
	);

	const openOperationDialog = (account?: LoanDashboardAccount | null) => {
		setOperationDefaults({
			institutionId:
				account?.institutionId ?? selectedAccount?.institutionId ?? null,
			loanType: account?.loanType ?? selectedAccount?.loanType ?? "revolving",
		});
		setOperationDialogOpen(true);
	};

	const openPaymentDialog = (accountId: string, installmentId: string) => {
		setSelectedAccountId(accountId);
		setPaymentTarget({ accountId, installmentId });
		setPaymentDialogOpen(true);
	};

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<RiRefundLine className="size-4 text-primary" />
						<span>Empréstimos</span>
					</div>
					<h1 className="text-3xl font-bold tracking-tight">Empréstimos</h1>
					<p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
						Gerencie instituições, linhas de crédito, operações, parcelas e
						pagamentos com recomposição automática do limite rotativo.
					</p>
				</div>

				<div className="flex flex-wrap gap-2">
					<LoanInstitutionDialog
						open={institutionDialogOpen}
						onOpenChange={setInstitutionDialogOpen}
						onSuccess={() => {
							setInstitutionDialogOpen(false);
							window.location.reload();
						}}
						trigger={
							<Button type="button" variant="outline">
								<RiBankLine className="mr-2 size-4" />
								Nova conta / linha
							</Button>
						}
					/>
					<Button
						type="button"
						onClick={() => openOperationDialog(selectedAccount)}
						disabled={!dashboard.institutions.length}
					>
						<RiAddLine className="mr-2 size-4" />
						Nova operação
					</Button>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<OverviewCard
					label="Linhas cadastradas"
					value={String(dashboard.totals.accounts)}
					description={`${dashboard.totals.revolvingAccounts} rotativas · ${dashboard.totals.fixedAccounts} fixas`}
					icon={<RiBankLine className="size-4" />}
				/>
				<OverviewCard
					label="Limite / contratado"
					value={formatCurrency(dashboard.totals.totalLimit)}
					description="Soma dos limites rotativos e valores contratados"
					icon={<RiRefundLine className="size-4" />}
				/>
				<OverviewCard
					label="Disponível"
					value={formatCurrency(dashboard.totals.totalAvailable)}
					description="Recomposto apenas pelas amortizações de principal"
					icon={<RiHandCoinLine className="size-4" />}
				/>
				<OverviewCard
					label="Saldo total"
					value={formatCurrency(dashboard.totals.totalDue)}
					description="Principal, juros e encargos em aberto"
					icon={<RiMoneyDollarCircleLine className="size-4" />}
				/>
			</div>

			{dashboard.accounts.length === 0 ? (
				<Card className="border-dashed">
					<EmptyState
						className="min-h-[360px] max-w-none"
						media={<RiBankLine className="size-6 text-primary" />}
						title="Ainda não há empréstimos cadastrados"
						description="Crie uma conta / linha e depois adicione operações para começar a acompanhar parcelas e pagamentos."
					>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								onClick={() => setInstitutionDialogOpen(true)}
							>
								Nova conta / linha
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => openOperationDialog(null)}
								disabled={!dashboard.institutions.length}
							>
								Nova operação
							</Button>
						</div>
					</EmptyState>
				</Card>
			) : (
				<div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)]">
					<div className="space-y-8">
						<LoansGroupSection
							title="Crédito rotativo"
							description="Limite concedido, valor utilizado e recomposição pelo principal amortizado."
							accounts={revolvingAccounts}
							selectedAccountId={selectedAccountId}
							onSelectAccount={setSelectedAccountId}
							onCreateOperation={openOperationDialog}
						/>

						<LoansGroupSection
							title="Empréstimo fixo"
							description="Total contratado, valor recebido, saldo e parcelas em andamento."
							accounts={fixedAccounts}
							selectedAccountId={selectedAccountId}
							onSelectAccount={setSelectedAccountId}
							onCreateOperation={openOperationDialog}
						/>
					</div>

					<div className="space-y-6">
						<LoanDetailPanel
							account={selectedAccount}
							onCreateOperation={() => openOperationDialog(selectedAccount)}
							onRegisterPayment={(installmentId) => {
								if (!selectedAccount) return;
								openPaymentDialog(selectedAccount.id, installmentId);
							}}
						/>
					</div>
				</div>
			)}

			<LoanOperationDialog
				open={operationDialogOpen}
				onOpenChange={setOperationDialogOpen}
				onSuccess={() => {
					setOperationDialogOpen(false);
					window.location.reload();
				}}
				institutions={dashboard.institutions}
				defaultInstitutionId={operationDefaults.institutionId ?? undefined}
				defaultLoanType={operationDefaults.loanType}
				trigger={null}
			/>

			<LoanPaymentDialog
				open={paymentDialogOpen}
				onOpenChange={setPaymentDialogOpen}
				onSuccess={() => {
					setPaymentDialogOpen(false);
					window.location.reload();
				}}
				account={selectedAccount}
				installmentId={paymentTarget?.installmentId ?? undefined}
				trigger={null}
			/>
		</div>
	);
}
