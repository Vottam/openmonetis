import { config as dotenvConfig } from "dotenv";
import { vi } from "vitest";

const loadTestEnv = () => {
	const result = dotenvConfig({ path: ".env.test.local" });

	if (!process.env.DATABASE_URL) {
		throw new Error(
			"DATABASE_URL não encontrada em .env.test.local. Crie o arquivo local de teste antes de rodar a suíte.",
		);
	}

	const parsed = new URL(process.env.DATABASE_URL);
	process.env.VITEST_TARGET_HOST = parsed.hostname;
	process.env.VITEST_TARGET_PORT = parsed.port;
	process.env.VITEST_TARGET_DB = parsed.pathname.replace(/^\//, "");
	process.env.VITEST_TARGET_USER = parsed.username;

	return result;
};

loadTestEnv();

const TEST_USER = {
	id: "loan-test-user",
	name: "Loan Test User",
	email: "loan-test@example.com",
	emailVerified: true,
	image: null,
	createdAt: new Date("2025-01-01T00:00:00.000Z"),
	updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

const loanTestContext = globalThis as typeof globalThis & {
	__loanTestUser?: typeof TEST_USER;
};

const getLoanTestUser = () => loanTestContext.__loanTestUser ?? TEST_USER;

loanTestContext.__loanTestUser = TEST_USER;

vi.mock("@/shared/lib/auth/server", () => ({
	getUser: vi.fn(async () => getLoanTestUser()),
	getUserId: vi.fn(async () => getLoanTestUser().id),
	getUserSession: vi.fn(async () => ({ user: getLoanTestUser() })),
	getOptionalUserSession: vi.fn(async () => ({ user: getLoanTestUser() })),
}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));
