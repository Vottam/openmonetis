import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/shared/lib/auth/config";
import { ensureDefaultPayerForUser } from "@/shared/lib/payers/defaults";

/**
 * Cached session fetch - deduplicates auth calls within a single request.
 * Layout + page calling getUser() will only hit auth once.
 */
const getSessionCached = cache(async () => {
	return auth.api.getSession({ headers: await headers() });
});

/**
 * Gets the current authenticated user
 * @returns User object
 * @throws Redirects to /login if user is not authenticated
 */
async function ensureDefaultPayerForSessionUser(user: Parameters<typeof ensureDefaultPayerForUser>[0]) {
	await ensureDefaultPayerForUser(user);
}

export async function getUser() {
	const session = await getSessionCached();

	if (!session?.user) {
		redirect("/login");
	}

	await ensureDefaultPayerForSessionUser(session.user);
	return session.user;
}

/**
 * Gets the current authenticated user ID
 * @returns User ID string
 * @throws Redirects to /login if user is not authenticated
 */
export async function getUserId() {
	const session = await getSessionCached();

	if (!session?.user) {
		redirect("/login");
	}

	await ensureDefaultPayerForSessionUser(session.user);
	return session.user.id;
}

/**
 * Gets the current authenticated session
 * @returns Full session object including user
 * @throws Redirects to /login if user is not authenticated
 */
export async function getUserSession() {
	const session = await getSessionCached();

	if (!session?.user) {
		redirect("/login");
	}

	await ensureDefaultPayerForSessionUser(session.user);
	return session;
}

/**
 * Gets the current session without requiring authentication
 * @returns Session object or null if not authenticated
 * @note This function does not redirect if user is not authenticated
 */
export async function getOptionalUserSession() {
	return getSessionCached();
}
