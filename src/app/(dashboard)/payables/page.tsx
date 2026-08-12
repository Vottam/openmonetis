import { connection } from "next/server";
import { PayablesPage } from "@/features/payables/page";
import { fetchPayablesPageData } from "@/features/payables/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const data = await fetchPayablesPageData(userId);

	return <PayablesPage data={data} />;
}
