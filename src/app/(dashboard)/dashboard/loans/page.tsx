import { connection } from "next/server";
import LoansPage from "@/features/loans/page";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	await getUserId();

	return (
		<main className="flex flex-col gap-6">
			<LoansPage />
		</main>
	);
}
