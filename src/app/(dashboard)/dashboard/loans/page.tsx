import { connection } from "next/server";
import { buildLoanDashboardData } from "@/features/loans/lib/dashboard";
import { LoansPage } from "@/features/loans/page";
import {
	fetchInstitutionsForUser,
	fetchLoanAccountDetails,
} from "@/features/loans/queries";
import { getUserId } from "@/shared/lib/auth/server";
import { loadLogoOptions } from "@/shared/lib/logo/options";

export default async function Page() {
	await connection();
	const userId = await getUserId();

	const [institutions, loanData, logoOptions] = await Promise.all([
		fetchInstitutionsForUser(userId),
		fetchLoanAccountDetails(userId),
		loadLogoOptions(),
	]);

	const dashboard = buildLoanDashboardData({
		institutions,
		operations: loanData.operations,
		installments: loanData.installments,
		payments: loanData.payments,
	});

	return <LoansPage dashboard={dashboard} logoOptions={logoOptions} />;
}
