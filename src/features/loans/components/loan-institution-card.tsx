"use client";

import { RiDeleteBinLine } from "@remixicon/react";
import Image from "next/image";
import { useState } from "react";
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
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { resolveLogoSrc } from "@/shared/lib/logo";
import {
	buildInitials,
	getCategoryBgColorFromName,
	getCategoryColorFromName,
} from "@/shared/utils/category-colors";
import { cn } from "@/shared/utils/ui";

import type { LoanInstitutionSummary } from "../lib/dashboard";

function InstitutionLogo({
	name,
	logo,
}: {
	name: string;
	logo?: string | null;
}) {
	const [imageError, setImageError] = useState(false);
	const src = resolveLogoSrc(logo);

	if (!src || imageError) {
		return (
			<div
				className="flex size-12 shrink-0 items-center justify-center rounded-full font-semibold"
				style={{
					backgroundColor: getCategoryBgColorFromName(name),
					color: getCategoryColorFromName(name),
				}}
				aria-hidden
			>
				{buildInitials(name)}
			</div>
		);
	}

	return (
		<Image
			src={src}
			alt={name}
			width={48}
			height={48}
			className="size-12 rounded-full border bg-background object-contain p-1"
			onError={() => setImageError(true)}
		/>
	);
}

export function LoanInstitutionCard({
	summary,
	selected = false,
	onClick,
	onCreateOperation,
	onDelete,
}: {
	summary: LoanInstitutionSummary;
	selected?: boolean;
	onClick: () => void;
	onCreateOperation: () => void;
	onDelete: () => void;
}) {
	const { institution, accountCount, operationCount, firstAccountId } = summary;

	return (
		<Card
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onClick();
				}
			}}
			className={cn(
				"cursor-pointer border bg-card/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				selected && "border-primary/50 ring-2 ring-primary/20 shadow-md",
			)}
		>
			<CardHeader className="space-y-4">
				<div className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<InstitutionLogo name={institution.name} logo={institution.logo} />
						<div className="min-w-0 space-y-1">
							<CardTitle className="truncate text-base">
								{institution.name}
							</CardTitle>
							<CardDescription className="truncate text-sm">
								{institution.type === "bank" ? "Banco" : "Outros"}
								{institution.description ? ` · ${institution.description}` : ""}
							</CardDescription>
						</div>
					</div>

					<Badge variant={accountCount > 0 ? "default" : "outline"}>
						{accountCount} linha(s)
					</Badge>
				</div>

				<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
					<Badge variant="secondary">{operationCount} operação(ões)</Badge>
					<Badge variant="outline">
						{firstAccountId ? "Com operações" : "Sem operações ainda"}
					</Badge>
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
					<p className="text-sm text-muted-foreground">
						Clique para abrir a instituição e ver suas operações.
					</p>

					<div className="flex items-center gap-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="text-destructive hover:bg-destructive/10 hover:text-destructive"
									onClick={(event) => {
										event.stopPropagation();
										onDelete();
									}}
								>
									<RiDeleteBinLine className="size-4" aria-hidden />
									<span className="sr-only">Remover instituição</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Remover instituição</TooltipContent>
						</Tooltip>

						<Button
							type="button"
							variant="outline"
							onClick={(event) => {
								event.stopPropagation();
								onCreateOperation();
							}}
						>
							Nova operação
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
