"use client";

import {
	RiAddLine,
	RiCalendarEventLine,
	RiCloseLine,
	RiDeleteBin5Line,
	RiPencilLine,
} from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { normalizeDecimalInput } from "@/shared/utils/currency";
import { formatFinancialDateLabel } from "@/shared/utils/financial-dates";
import { cn } from "@/shared/utils/ui";
import {
	cancelPayableAction,
	createPayableAction,
	deletePayableAction,
	informOccurrenceAmountAction,
	updatePayableAction,
} from "./actions";
import type {
	Payable,
	PayableOccurrence,
	PayableRecurrenceType,
	PayablesPageData,
	PayableWithOccurrences,
} from "./lib/types";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
};

const RECURRENCE_LABELS: Record<PayableRecurrenceType, string> = {
	once: "Única",
	monthly_fixed: "Mensal fixa",
	monthly_variable: "Mensal variável",
};

const PAYABLE_STATUS_LABELS: Record<Payable["status"], string> = {
	active: "Ativa",
	cancelled: "Cancelada",
};

const OCCURRENCE_STATUS_LABELS: Record<PayableOccurrence["status"], string> = {
	scheduled: "Agendada",
	awaiting_amount: "Aguardando valor",
	pending: "Pendente",
	partial: "Parcial",
	paid: "Paga",
	cancelled: "Cancelada",
};

const BADGE_VARIANT: Record<
	PayableOccurrence["status"] | Payable["status"] | "overdue",
	"default" | "outline" | "destructive" | "secondary"
> = {
	active: "outline",
	cancelled: "destructive",
	scheduled: "secondary",
	awaiting_amount: "secondary",
	pending: "outline",
	partial: "default",
	paid: "default",
	overdue: "destructive",
};

type PayableFormState = {
	description: string;
	supplierName: string;
	categoryId: string;
	recurrenceType: PayableRecurrenceType;
	defaultAmount: string;
	startsAt: string;
	endsAt: string;
};

function toInputDate(value: string | null | undefined): string {
	return value?.slice(0, 10) ?? "";
}

function formatDateOnly(value: string | null | undefined): string {
	if (!value) {
		return "—";
	}

	const [year, month, day] = value.split("-");
	if (!year || !month || !day) {
		return value;
	}

	return `${day}/${month}/${year}`;
}

function formatMoneyValue(value: number | null | undefined): string {
	return value === null || value === undefined
		? ""
		: new Intl.NumberFormat("pt-BR", {
				style: "currency",
				currency: "BRL",
			}).format(value);
}

function formatOccurrenceTitle(occurrence: PayableOccurrence): string {
	if (occurrence.status === "awaiting_amount") {
		return "Aguardando valor";
	}

	if (occurrence.expectedAmount !== null) {
		return formatMoneyValue(occurrence.expectedAmount);
	}

	if (occurrence.actualAmount !== null) {
		return formatMoneyValue(occurrence.actualAmount);
	}

	return "Sem valor";
}

function buildInitialFormState(
	payable?: PayableWithOccurrences | null,
): PayableFormState {
	return {
		description: payable?.payable.description ?? "",
		supplierName: payable?.payable.supplierName ?? "",
		categoryId: payable?.payable.categoryId ?? "",
		recurrenceType: payable?.payable.recurrenceType ?? "once",
		defaultAmount:
			payable?.payable.defaultAmount !== null &&
			payable?.payable.defaultAmount !== undefined &&
			payable?.payable.recurrenceType !== "monthly_variable"
				? String(payable.payable.defaultAmount)
				: "",
		startsAt: toInputDate(payable?.payable.startsAt),
		endsAt: toInputDate(payable?.payable.endsAt),
	};
}

function statusBadgeVariant(
	status: PayableOccurrence["status"] | Payable["status"] | "overdue",
) {
	return BADGE_VARIANT[status];
}

function payableOccurrenceVisualStatus(occurrence: PayableOccurrence) {
	if (occurrence.status === "pending" && occurrence.isOverdue) {
		return "overdue" as const;
	}
	return occurrence.status;
}

function summaryOrder(payable: PayableWithOccurrences) {
	const openOccurrences = payable.occurrences.filter(
		(occurrence) =>
			occurrence.status !== "cancelled" && occurrence.status !== "paid",
	);
	const overdueCount = openOccurrences.filter(
		(occurrence) => occurrence.isOverdue,
	).length;
	const awaitingCount = openOccurrences.filter(
		(occurrence) => occurrence.status === "awaiting_amount",
	).length;
	const nextDue = openOccurrences
		.slice()
		.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

	return [
		payable.payable.status === "cancelled" ? 2 : 0,
		-overdueCount,
		-awaitingCount,
		nextDue?.dueDate ?? "9999-12-31",
		payable.payable.description.toLowerCase(),
	] as const;
}

function PayableFormDialog({
	open,
	mode,
	payable,
	categories,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	mode: "create" | "update";
	payable?: PayableWithOccurrences | null;
	categories: PayablesPageData["categories"];
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [form, setForm] = useState<PayableFormState>(() =>
		buildInitialFormState(payable ?? null),
	);

	useEffect(() => {
		if (!open) {
			return;
		}
		setForm(buildInitialFormState(payable ?? null));
		setErrorMessage(null);
	}, [open, payable]);

	const amountRequired = form.recurrenceType !== "monthly_variable";
	const showEndsAt = form.recurrenceType !== "once";
	const dueDateLabel =
		form.recurrenceType === "once" ? "Vencimento" : "Primeiro vencimento";

	const submit = async () => {
		const startsAt = form.startsAt;
		if (!form.description.trim()) {
			setErrorMessage("Informe a descrição.");
			return;
		}
		if (!form.supplierName.trim()) {
			setErrorMessage("Informe o fornecedor.");
			return;
		}
		if (!startsAt) {
			setErrorMessage("Informe a data de vencimento.");
			return;
		}

		const normalizedAmount = normalizeDecimalInput(form.defaultAmount);
		const amountValue = normalizedAmount ? Number(normalizedAmount) : null;
		if (
			amountRequired &&
			(amountValue === null ||
				!Number.isFinite(amountValue) ||
				amountValue <= 0)
		) {
			setErrorMessage("Informe um valor válido.");
			return;
		}

		const payload = {
			description: form.description.trim(),
			supplierName: form.supplierName.trim(),
			categoryId: form.categoryId || null,
			recurrenceType: form.recurrenceType,
			defaultAmount: amountRequired ? amountValue : null,
			startsAt,
			endsAt: showEndsAt && form.endsAt ? form.endsAt : null,
		};

		startTransition(async () => {
			const result =
				mode === "create"
					? await createPayableAction(payload)
					: await updatePayableAction({
							id: payable?.payable.id ?? "",
							...payload,
						});

			if (!result.success) {
				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			onOpenChange(false);
			onSaved();
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Nova conta a pagar" : "Editar conta a pagar"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Cadastre uma obrigação pontual ou recorrente sem criar transactions."
							: "Atualize os dados do template selecionado."}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="payable-description">Descrição</Label>
						<Input
							id="payable-description"
							value={form.description}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									description: event.target.value,
								}))
							}
							placeholder="Ex.: Aluguel"
						/>
					</div>

					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="payable-supplier">Fornecedor</Label>
						<Input
							id="payable-supplier"
							value={form.supplierName}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									supplierName: event.target.value,
								}))
							}
							placeholder="Ex.: Loja X"
						/>
					</div>

					<div className="space-y-2">
						<Label>Categoria</Label>
						<Select
							value={form.categoryId || "none"}
							onValueChange={(value) =>
								setForm((current) => ({
									...current,
									categoryId: value === "none" ? "" : value,
								}))
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Opcional" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Sem categoria</SelectItem>
								{categories.map((category) => (
									<SelectItem key={category.value} value={category.value}>
										{category.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label>Tipo</Label>
						<Select
							value={form.recurrenceType}
							onValueChange={(value) =>
								setForm((current) => ({
									...current,
									recurrenceType: value as PayableRecurrenceType,
									defaultAmount:
										value === "monthly_variable" ? "" : current.defaultAmount,
								}))
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{amountRequired ? (
						<div className="space-y-2">
							<Label htmlFor="payable-amount">Valor</Label>
							<Input
								id="payable-amount"
								value={form.defaultAmount}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										defaultAmount: event.target.value,
									}))
								}
								placeholder="0,00"
							/>
						</div>
					) : null}

					<div className="space-y-2">
						<Label htmlFor="payable-starts-at">{dueDateLabel}</Label>
						<Input
							id="payable-starts-at"
							type="date"
							value={form.startsAt}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									startsAt: event.target.value,
								}))
							}
						/>
					</div>

					{showEndsAt ? (
						<div className="space-y-2">
							<Label htmlFor="payable-ends-at">Até opcional</Label>
							<Input
								id="payable-ends-at"
								type="date"
								value={form.endsAt}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										endsAt: event.target.value,
									}))
								}
							/>
						</div>
					) : null}
				</div>

				{errorMessage ? (
					<p className="text-sm text-destructive">{errorMessage}</p>
				) : null}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={() => void submit()}
						disabled={isPending}
					>
						{isPending ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function PayableDetailDialog({
	open,
	payable,
	onOpenChange,
	onEdit,
	onCancel,
	onDelete,
	onInformAmount,
}: {
	open: boolean;
	payable: PayableWithOccurrences | null;
	onOpenChange: (open: boolean) => void;
	onEdit: (payable: PayableWithOccurrences) => void;
	onCancel: (payable: PayableWithOccurrences) => void;
	onDelete: (payable: PayableWithOccurrences) => void;
	onInformAmount: (occurrence: PayableOccurrence) => void;
}) {
	if (!payable) {
		return null;
	}

	const openOccurrences = payable.occurrences.filter(
		(occurrence) => occurrence.status !== "cancelled",
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>{payable.payable.description}</DialogTitle>
					<DialogDescription>
						{payable.payable.supplierName}
						{payable.payable.categoryName
							? ` · ${payable.payable.categoryName}`
							: ""}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Resumo do template</CardTitle>
							<CardDescription>
								{RECURRENCE_LABELS[payable.payable.recurrenceType]} ·{" "}
								{PAYABLE_STATUS_LABELS[payable.payable.status]}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2 text-sm">
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Valor padrão</span>
								<span className="font-medium">
									{payable.payable.defaultAmount !== null
										? formatMoneyValue(payable.payable.defaultAmount)
										: "—"}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">
									Primeiro vencimento
								</span>
								<span className="font-medium">
									{formatDateOnly(payable.payable.startsAt)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Categoria</span>
								<span className="font-medium">
									{payable.payable.categoryName ?? "—"}
								</span>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Ocorrências</CardTitle>
							<CardDescription>
								{openOccurrences.length} ocorrências visíveis no horizonte
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{openOccurrences.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									Nenhuma ocorrência no horizonte.
								</p>
							) : (
								openOccurrences.map((occurrence) => {
									const visualStatus =
										payableOccurrenceVisualStatus(occurrence);
									return (
										<div
											key={occurrence.id}
											className="flex items-center justify-between gap-3 rounded-lg border p-3"
										>
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													<span className="text-sm font-medium">
														{occurrence.period}
													</span>
													<Badge variant={statusBadgeVariant(visualStatus)}>
														{visualStatus === "overdue"
															? "Vencida"
															: OCCURRENCE_STATUS_LABELS[occurrence.status]}
													</Badge>
												</div>
												<p className="text-xs text-muted-foreground">
													{formatFinancialDateLabel(
														occurrence.dueDate,
														"Vence em",
														DATE_FORMAT,
													)}
												</p>
											</div>
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium">
													{formatOccurrenceTitle(occurrence)}
												</span>
												{occurrence.status === "awaiting_amount" ? (
													<Button
														type="button"
														size="sm"
														variant="outline"
														onClick={() => onInformAmount(occurrence)}
													>
														Informar valor
													</Button>
												) : null}
											</div>
										</div>
									);
								})
							)}
						</CardContent>
					</Card>
				</div>

				<DialogFooter className="gap-2 sm:justify-between">
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => onEdit(payable)}
						>
							<RiPencilLine className="size-4" />
							Editar
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => onCancel(payable)}
						>
							<RiCloseLine className="size-4" />
							Cancelar
						</Button>
					</div>
					<Button
						type="button"
						variant="destructive"
						onClick={() => onDelete(payable)}
					>
						<RiDeleteBin5Line className="size-4" />
						Remover
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function InformAmountDialog({
	open,
	occurrence,
	payable,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	occurrence: PayableOccurrence | null;
	payable: PayableWithOccurrences | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [value, setValue] = useState("");
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const visible = open && !!occurrence && !!payable;

	useEffect(() => {
		if (visible) {
			setValue("");
			setErrorMessage(null);
		}
	}, [visible]);

	const submit = async () => {
		const normalized = normalizeDecimalInput(value);
		const amount = normalized ? Number(normalized) : NaN;
		if (!Number.isFinite(amount) || amount <= 0) {
			setErrorMessage("Informe um valor válido.");
			return;
		}

		startTransition(async () => {
			const result = await informOccurrenceAmountAction({
				occurrenceId: occurrence?.id ?? "",
				amount,
			});

			if (!result.success) {
				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			onSaved();
			onOpenChange(false);
		});
	};

	return (
		<Dialog open={visible} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Informar valor</DialogTitle>
					<DialogDescription>
						{payable ? payable.payable.description : "Conta a pagar"} ·{" "}
						{occurrence?.period}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2">
					<Label htmlFor="payable-amount-input">Valor</Label>
					<Input
						id="payable-amount-input"
						value={value}
						onChange={(event) => setValue(event.target.value)}
						placeholder="0,00"
					/>
				</div>

				{errorMessage ? (
					<p className="text-sm text-destructive">{errorMessage}</p>
				) : null}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={() => void submit()}
						disabled={isPending}
					>
						{isPending ? "Salvando..." : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function PayablesPage({ data }: { data: PayablesPageData }) {
	const router = useRouter();
	const [formOpen, setFormOpen] = useState(false);
	const [formMode, setFormMode] = useState<"create" | "update">("create");
	const [selectedPayable, setSelectedPayable] =
		useState<PayableWithOccurrences | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] =
		useState<PayableWithOccurrences | null>(null);
	const [cancelTarget, setCancelTarget] =
		useState<PayableWithOccurrences | null>(null);
	const [informTarget, setInformTarget] = useState<{
		payable: PayableWithOccurrences | null;
		occurrence: PayableOccurrence;
	} | null>(null);

	const orderedPayables = useMemo(
		() =>
			data.payables.slice().sort((left, right) => {
				const leftScore = summaryOrder(left);
				const rightScore = summaryOrder(right);
				for (let index = 0; index < leftScore.length; index += 1) {
					if (leftScore[index] !== rightScore[index]) {
						return leftScore[index] < rightScore[index] ? -1 : 1;
					}
				}
				return 0;
			}),
		[data.payables],
	);

	const openCreate = () => {
		setFormMode("create");
		setSelectedPayable(null);
		setFormOpen(true);
	};

	const openEdit = (payable: PayableWithOccurrences) => {
		setFormMode("update");
		setSelectedPayable(payable);
		setFormOpen(true);
	};

	const openDetail = (payable: PayableWithOccurrences) => {
		setSelectedPayable(payable);
		setDetailOpen(true);
	};

	const refresh = () => router.refresh();

	const handleDelete = async (payable: PayableWithOccurrences) => {
		const result = await deletePayableAction({ id: payable.payable.id });
		if (!result.success) {
			toast.error(result.error);
			throw new Error(result.error);
		}
		toast.success(result.message);
		setDeleteTarget(null);
		refresh();
	};

	const handleCancel = async (payable: PayableWithOccurrences) => {
		const result = await cancelPayableAction({ id: payable.payable.id });
		if (!result.success) {
			toast.error(result.error);
			throw new Error(result.error);
		}
		toast.success(result.message);
		setCancelTarget(null);
		refresh();
	};

	const nextDueText = data.summary.nextDueDate
		? formatFinancialDateLabel(data.summary.nextDueDate, "Próximo", DATE_FORMAT)
		: "Sem próximas obrigações";

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<RiCalendarEventLine className="size-4 text-primary" />
						<span>Finanças</span>
					</div>
					<h1 className="text-3xl font-bold tracking-tight">Contas a pagar</h1>
					<p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
						Obrigações pontuais e recorrentes, com calendário read-only e sem
						criar transactions antecipadamente.
					</p>
				</div>

				<Button onClick={openCreate} className="self-start lg:self-auto">
					<RiAddLine className="size-4" />
					Nova conta a pagar
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				{[
					{
						label: "Pendentes",
						value: data.summary.pendingCount,
						description: "Ocorrências abertas",
					},
					{
						label: "Vencidas",
						value: data.summary.overdueCount,
						description: "Atenção imediata",
					},
					{
						label: "Aguardando valor",
						value: data.summary.awaitingAmountCount,
						description: "Sem valor informado",
					},
					{
						label: "Próximos vencimentos",
						value: nextDueText,
						description: "Baseado no horizonte ativo",
					},
				].map((item) => (
					<Card key={item.label}>
						<CardHeader className="space-y-2">
							<CardDescription>{item.label}</CardDescription>
							<CardTitle
								className={cn(
									"text-2xl",
									typeof item.value === "string" && "text-lg",
								)}
							>
								{item.value}
							</CardTitle>
							<CardDescription>{item.description}</CardDescription>
						</CardHeader>
					</Card>
				))}
			</div>

			{orderedPayables.length === 0 ? (
				<EmptyState
					media={<RiCalendarEventLine className="size-8 text-primary" />}
					title="Nenhuma conta a pagar"
					description="Cadastre obrigações pontuais e recorrentes para visualizá-las no calendário."
				>
					<Button onClick={openCreate}>
						<RiAddLine className="size-4" />
						Nova conta a pagar
					</Button>
				</EmptyState>
			) : (
				<div className="grid gap-4">
					{orderedPayables.map((item) => {
						const nextOccurrence = item.occurrences
							.filter((occurrence) => occurrence.status !== "cancelled")
							.sort((left, right) =>
								left.dueDate.localeCompare(right.dueDate),
							)[0];
						const visualStatus = nextOccurrence
							? payableOccurrenceVisualStatus(nextOccurrence)
							: item.payable.status;

						return (
							<Card key={item.payable.id} className="overflow-hidden">
								<CardContent className="p-0">
									<button
										type="button"
										className="flex w-full flex-col gap-4 p-4 text-left transition-colors hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
										onClick={() => openDetail(item)}
									>
										<div className="space-y-1">
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="text-base font-semibold">
													{item.payable.description}
												</h3>
												<Badge variant={statusBadgeVariant(visualStatus)}>
													{visualStatus === "overdue"
														? "Vencida"
														: item.payable.status === "cancelled"
															? "Cancelada"
															: item.payable.recurrenceType ===
																		"monthly_variable" &&
																	nextOccurrence?.status === "awaiting_amount"
																? "Aguardando valor"
																: nextOccurrence?.status === "pending"
																	? "Pendente"
																	: item.payable.status === "active"
																		? "Ativa"
																		: PAYABLE_STATUS_LABELS[
																				item.payable.status
																			]}
												</Badge>
											</div>
											<p className="text-sm text-muted-foreground">
												Fornecedor: {item.payable.supplierName}
												{item.payable.categoryName
													? ` · ${item.payable.categoryName}`
													: ""}
											</p>
											<p className="text-xs text-muted-foreground">
												{RECURRENCE_LABELS[item.payable.recurrenceType]} ·{" "}
												{item.occurrences.length} ocorrência(s) no horizonte
											</p>
										</div>
										<div className="flex flex-col items-end gap-1">
											<span className="text-sm font-medium">
												{nextOccurrence
													? formatOccurrenceTitle(nextOccurrence)
													: "Sem ocorrência"}
											</span>
											{nextOccurrence ? (
												<span className="text-xs text-muted-foreground">
													{formatFinancialDateLabel(
														nextOccurrence.dueDate,
														"Vence em",
														DATE_FORMAT,
													)}
												</span>
											) : null}
										</div>
									</button>

									<div className="flex flex-wrap gap-2 border-t px-4 py-3">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => openEdit(item)}
										>
											<RiPencilLine className="size-4" />
											Editar
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => setCancelTarget(item)}
										>
											<RiCloseLine className="size-4" />
											Cancelar
										</Button>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											onClick={() => setDeleteTarget(item)}
										>
											<RiDeleteBin5Line className="size-4" />
											Remover
										</Button>
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}

			<PayableFormDialog
				open={formOpen}
				mode={formMode}
				payable={selectedPayable}
				categories={data.categories}
				onOpenChange={setFormOpen}
				onSaved={refresh}
			/>

			<PayableDetailDialog
				open={detailOpen}
				payable={selectedPayable}
				onOpenChange={setDetailOpen}
				onEdit={(item) => {
					setDetailOpen(false);
					openEdit(item);
				}}
				onCancel={(item) => setCancelTarget(item)}
				onDelete={(item) => setDeleteTarget(item)}
				onInformAmount={(occurrence) => {
					setDetailOpen(false);
					setInformTarget({ payable: selectedPayable ?? null, occurrence });
				}}
			/>

			<InformAmountDialog
				open={Boolean(informTarget)}
				occurrence={informTarget?.occurrence ?? null}
				payable={informTarget?.payable ?? null}
				onOpenChange={(open) => !open && setInformTarget(null)}
				onSaved={refresh}
			/>

			<ConfirmActionDialog
				open={Boolean(deleteTarget)}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
				title={
					deleteTarget
						? `Remover ${deleteTarget.payable.description}?`
						: "Remover conta a pagar?"
				}
				description="Essa ação remove o template e todas as ocorrências associadas."
				confirmLabel="Remover"
				pendingLabel="Removendo..."
				confirmVariant="destructive"
				onConfirm={async () => {
					if (deleteTarget) {
						await handleDelete(deleteTarget);
					}
				}}
			/>

			<ConfirmActionDialog
				open={Boolean(cancelTarget)}
				onOpenChange={(open) => !open && setCancelTarget(null)}
				title={
					cancelTarget
						? `Cancelar ${cancelTarget.payable.description}?`
						: "Cancelar conta a pagar?"
				}
				description="O template será cancelado e as ocorrências abertas também serão marcadas como canceladas."
				confirmLabel="Cancelar"
				pendingLabel="Cancelando..."
				confirmVariant="destructive"
				onConfirm={async () => {
					if (cancelTarget) {
						await handleCancel(cancelTarget);
					}
				}}
			/>
		</div>
	);
}
