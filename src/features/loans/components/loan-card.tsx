// @ts-nocheck
"use client";

import { RiBankLine, RiDeleteLine } from "@remixicon/react";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { formatCurrency } from "@/shared/utils/currency";
import type { LoanAccount } from "./types";

// ==================== Account Card ====================

export function LoanAccountCard({
	account,
	onView,
	onEdit,
	onDelete,
}: {
	account: LoanAccount;
	onView?: () => void;
	onEdit?: () => void;
	onDelete?: () => void;
}) {
	const summary = account.summary;
	const totalInstallments = account.installments.length;
	const paidInstallments = account.installments.filter((i) => i.paid).length;

	return (
		<Card className="shadow-sm hover:shadow-md transition-shadow">
			<CardHeader>
				<div className="flex items-center justify-between flex-wrap gap-2">
					<div className="flex items-center gap-2">
						<RiBankLine className="size-5 text-primary" />
						<CardTitle className="font-semibold">
							{account.institutionName}
						</CardTitle>
					</div>
					<div className="flex gap-2">
						<Tabs value={account.loanType} onValueChange={() => {}}>
							<TabsList>
								<TabsTrigger value="revolving">Crédito Rotativo</TabsTrigger>
								<TabsTrigger value="fixed">Empréstimo Fixo</TabsTrigger>
							</TabsList>
						</Tabs>
					</div>
				</div>
				<CardDescription>
					{account.loanType === "revolving"
						? "Linha de crédito rotativa"
						: "Empréstimo fixo"}
				</CardDescription>
			</CardHeader>

			<CardContent>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div>
						<span className="text-xs text-gray-500">Limite concedido</span>
						<p className="text-lg font-semibold">
							{formatCurrency(summary.limit)}
						</p>
					</div>
					<div>
						<span className="text-xs text-gray-500">Disponível</span>
						<p className="text-lg font-semibold">
							{formatCurrency(summary.available)}
						</p>
					</div>
					<div>
						<span className="text-xs text-gray-500">Utilizado</span>
						<p className="text-lg font-semibold">
							{formatCurrency(summary.utilized)}
						</p>
					</div>
					<div>
						<span className="text-xs text-gray-500">A pagar</span>
						<p className="text-lg font-semibold">
							{formatCurrency(summary.totalPayable)}
						</p>
					</div>
					<div>
						<span className="text-xs text-gray-500">Principal restante</span>
						<p className="text-lg font-semibold">
							{formatCurrency(summary.remainingPrincipal)}
						</p>
					</div>
					<div>
						<span className="text-xs text-gray-500">Juros restantes</span>
						<p className="text-lg font-semibold">
							{formatCurrency(summary.remainingInterest)}
						</p>
					</div>
					<div>
						<span className="text-xs text-gray-500">Encargos restantes</span>
						<p className="text-lg font-semibold">
							{formatCurrency(summary.remainingCharge)}
						</p>
					</div>
					<div>
						<span className="text-xs text-gray-500">Parcelas</span>
						<p className="text-lg font-semibold">
							{totalInstallments} / {account.summary.totalInstallments}
						</p>
					</div>
					<div>
						<span className="text-xs text-gray-500">Parcelas pagas</span>
						<p className="text-lg font-semibold">
							{paidInstallments} / {totalInstallments}
						</p>
					</div>
				</div>
			</CardContent>

			<div className="border-t border-gray-200 p-3 flex gap-2">
				<Button size="sm" onClick={() => onView?.()} className="flex-1">
					Ver detalhes
				</Button>
				{onEdit && (
					<Button size="sm" variant="outline" onClick={onEdit}>
						Editar
					</Button>
				)}
				{onDelete && (
					<Button size="sm" variant="destructive" onClick={() => onDelete?.()}>
						Remover
					</Button>
				)}
			</div>
		</Card>
	);
}

// ==================== Loan Card ====================

export function LoanCard({
	account,
	onView,
	onDelete,
}: {
	account: LoanAccount;
	onView?: () => void;
	onDelete?: () => void;
}) {
	return (
		<Card className="shadow-sm hover:shadow-md transition-shadow">
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<RiBankLine className="size-5 text-primary" />
						<CardTitle className="font-semibold">
							{account.institutionName}
						</CardTitle>
					</div>
					<Button size="sm" onClick={() => onView?.()} className="flex-1">
						Ver detalhes
					</Button>
				</div>
			</CardHeader>

			<CardContent>
				<div className="flex justify-between text-sm">
					<span className="text-gray-500">Tipo</span>
					<span>
						{account.loanType === "revolving"
							? "Crédito Rotativo"
							: "Empréstimo Fixo"}
					</span>
				</div>
				<div className="flex justify-between text-sm">
					<span className="text-gray-500">Estado</span>
					<span>{account.loanStatus}</span>
				</div>
				<div className="flex justify-between text-sm">
					<span className="text-gray-500">A pagar</span>
					<span className="font-medium">
						{formatCurrency(account.summary.totalPayable)}
					</span>
				</div>
			</CardContent>

			<Button size="sm" variant="destructive" onClick={() => onDelete?.()}>
				<RiDeleteLine className="size-4 mr-1" />
				Remover
			</Button>
		</Card>
	);
}
