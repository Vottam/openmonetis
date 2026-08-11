"use client";

import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";
import { createLoanInstitutionAction } from "@/features/loans/actions";
import { useLogoSelection } from "@/shared/components/logo-picker/use-logo-selection";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import { useFormState } from "@/shared/hooks/use-form-state";

import {
	buildLoanInstitutionInitialValues,
	type LoanInstitutionFormValues,
} from "../lib/form-values";

import {
	type InstitutionEntryMode,
	InstitutionFormFields,
} from "./institution-form-fields";

interface LoanInstitutionDialogProps {
	trigger?: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSuccess?: () => void;
	logoOptions: string[];
}

export function LoanInstitutionDialog({
	trigger,
	open,
	onOpenChange,
	onSuccess,
	logoOptions,
}: LoanInstitutionDialogProps) {
	const [isPending, startTransition] = useTransition();
	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);
	const [logoDialogOpen, setLogoDialogOpen] = useState(false);
	const [entryMode, setEntryMode] = useState<InstitutionEntryMode>("visual");

	const initialState = useMemo(() => buildLoanInstitutionInitialValues(), []);
	const { formState, resetForm, updateField, updateFields } =
		useFormState<LoanInstitutionFormValues>(initialState);

	useEffect(() => {
		if (dialogOpen) {
			resetForm(initialState);
			setEntryMode("visual");
			setLogoDialogOpen(false);
		}
	}, [dialogOpen, initialState, resetForm]);

	const handleLogoSelection = useLogoSelection({
		mode: "create",
		currentLogo: formState.logo,
		currentName: formState.name,
		onUpdate: (updates) => {
			updateFields(updates);
			requestAnimationFrame(() => {
				setLogoDialogOpen(false);
			});
		},
	});

	const handleEntryModeChange = (mode: InstitutionEntryMode) => {
		setEntryMode(mode);
		if (mode === "manual") {
			updateField("logo", "");
		}
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const name = formState.name.trim();
		if (entryMode === "visual" && !formState.logo.trim()) {
			toast.error(
				"Selecione uma instituição na biblioteca ou cadastre manualmente.",
			);
			return;
		}

		if (!name) {
			toast.error("Informe o nome da instituição.");
			return;
		}

		const payload = {
			name,
			type: formState.type,
			description: formState.description.trim(),
			logo: entryMode === "visual" ? formState.logo.trim() : "",
		};

		startTransition(async () => {
			try {
				const result = await createLoanInstitutionAction(payload);

				if (result.success) {
					toast.success(result.message);
					setDialogOpen(false);
					onSuccess?.();
					return;
				}

				toast.error(result.error);
			} catch {
				toast.error("Algo deu errado");
			}
		});
	};

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Nova instituição</DialogTitle>
					<DialogDescription>
						Escolha um logo da biblioteca nativa ou cadastre a instituição
						manualmente quando ela não estiver disponível.
					</DialogDescription>
				</DialogHeader>

				<form className="space-y-5" onSubmit={handleSubmit}>
					<InstitutionFormFields
						values={formState}
						onChange={updateField}
						logoOptions={logoOptions}
						logoDialogOpen={logoDialogOpen}
						onLogoDialogOpenChange={setLogoDialogOpen}
						onSelectLogo={handleLogoSelection}
						entryMode={entryMode}
						onEntryModeChange={handleEntryModeChange}
					/>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setDialogOpen(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : "Salvar instituição"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
