"use client";

import type { ReactNode } from "react";
import {
	LogoPickerDialog,
	LogoPickerTrigger,
} from "@/shared/components/logo-picker";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/utils/ui";
import type { LoanInstitutionFormValues } from "../lib/form-values";

export type InstitutionEntryMode = "visual" | "manual";

interface InstitutionFormFieldsProps {
	values: LoanInstitutionFormValues;
	onChange: <K extends keyof LoanInstitutionFormValues>(
		field: K,
		value: LoanInstitutionFormValues[K],
	) => void;
	logoOptions: string[];
	logoDialogOpen: boolean;
	onLogoDialogOpenChange: (open: boolean) => void;
	onSelectLogo: (logo: string) => void;
	entryMode: InstitutionEntryMode;
	onEntryModeChange: (mode: InstitutionEntryMode) => void;
}

function ModeButton({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: ReactNode;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant={active ? "default" : "outline"}
			size="sm"
			onClick={onClick}
			className="h-8"
		>
			{children}
		</Button>
	);
}

export function InstitutionFormFields({
	values,
	onChange,
	logoOptions,
	logoDialogOpen,
	onLogoDialogOpenChange,
	onSelectLogo,
	entryMode,
	onEntryModeChange,
}: InstitutionFormFieldsProps) {
	const isVisualMode = entryMode === "visual";
	const hasLogo = Boolean(values.logo.trim());

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
				<div className="space-y-1">
					<p className="text-sm font-medium text-foreground">
						Como você quer cadastrar a instituição?
					</p>
					<p className="text-xs text-muted-foreground">
						Use a biblioteca nativa de logos ou cadastre manualmente se a marca
						não estiver disponível.
					</p>
				</div>

				<div className="flex items-center gap-2">
					<ModeButton
						active={isVisualMode}
						onClick={() => onEntryModeChange("visual")}
					>
						Pela biblioteca
					</ModeButton>
					<ModeButton
						active={!isVisualMode}
						onClick={() => onEntryModeChange("manual")}
					>
						Cadastrar manualmente
					</ModeButton>
				</div>
			</div>

			{isVisualMode ? (
				<div className="space-y-4">
					<div className="space-y-2">
						<Label>Instituição / logo</Label>
						<LogoPickerTrigger
							selectedLogo={values.logo || null}
							disabled={logoOptions.length === 0}
							helperText="Pesquise e selecione a instituição na biblioteca nativa"
							placeholder="Selecionar instituição"
							onOpen={() => onLogoDialogOpenChange(true)}
						/>
						<p className="text-xs text-muted-foreground">
							Ao selecionar um logo, o nome é preenchido automaticamente.
						</p>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2 sm:col-span-2">
							<Label>Nome definido</Label>
							<div
								className={cn(
									"rounded-md border px-3 py-2 text-sm",
									hasLogo
										? "bg-background"
										: "bg-muted/30 text-muted-foreground",
								)}
							>
								{values.name.trim() ||
									"Selecione um logo para preencher o nome automaticamente."}
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="institution-type">Tipo</Label>
							<select
								id="institution-type"
								value={values.type}
								onChange={(event) =>
									onChange(
										"type",
										event.target.value as LoanInstitutionFormValues["type"],
									)
								}
								className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
							>
								<option value="bank">Banco</option>
								<option value="other">Outros</option>
							</select>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="institution-description">Descrição</Label>
						<textarea
							id="institution-description"
							value={values.description}
							onChange={(event) => onChange("description", event.target.value)}
							placeholder="Informações adicionais sobre a instituição"
							rows={3}
							className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="institution-name">Nome da instituição</Label>
						<Input
							id="institution-name"
							value={values.name}
							onChange={(event) => onChange("name", event.target.value)}
							placeholder="Ex.: Nubank"
							required
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="institution-type-manual">Tipo</Label>
						<select
							id="institution-type-manual"
							value={values.type}
							onChange={(event) =>
								onChange(
									"type",
									event.target.value as LoanInstitutionFormValues["type"],
								)
							}
							className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="bank">Banco</option>
							<option value="other">Outros</option>
						</select>
					</div>

					<div className="flex flex-col gap-2 sm:col-span-2">
						<Label htmlFor="institution-description-manual">Descrição</Label>
						<textarea
							id="institution-description-manual"
							value={values.description}
							onChange={(event) => onChange("description", event.target.value)}
							placeholder="Informações adicionais sobre a instituição"
							rows={3}
							className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				</div>
			)}

			<div className="flex items-center justify-between gap-3 rounded-md border border-dashed bg-muted/10 p-3">
				<p className="text-xs text-muted-foreground">
					Não encontrou a instituição na biblioteca? Cadastre manualmente.
				</p>
				{isVisualMode ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onEntryModeChange("manual")}
					>
						Cadastrar manualmente
					</Button>
				) : (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onEntryModeChange("visual")}
					>
						Voltar para a biblioteca
					</Button>
				)}
			</div>

			<LogoPickerDialog
				open={logoDialogOpen}
				logos={logoOptions}
				value={values.logo}
				onOpenChange={onLogoDialogOpenChange}
				onSelect={onSelectLogo}
				title="Escolher instituição"
				description="Pesquise e selecione a instituição na biblioteca nativa de logos do OpenMonetis."
				emptyState={
					<p className="text-sm text-muted-foreground">
						Nenhum logo disponível. Você pode cadastrar a instituição
						manualmente.
					</p>
				}
			/>
		</div>
	);
}
