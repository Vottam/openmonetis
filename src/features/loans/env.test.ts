import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL ausente no ambiente de teste.");
}

const parsed = new URL(databaseUrl);
const pool = new Pool({ connectionString: databaseUrl });

describe("ambiente do Vitest para loans", () => {
	beforeAll(async () => {
		await pool.query("SELECT 1");
	});

	afterAll(async () => {
		await pool.end();
	});

	it("carrega explicitamente o banco DEV/test da porta 55432", async () => {
		const result = await pool.query(
			"SELECT current_database() AS db, current_user AS user",
		);

		expect(process.env.VITEST_TARGET_HOST).toBe("127.0.0.1");
		expect(process.env.VITEST_TARGET_PORT).toBe("55432");
		expect(process.env.VITEST_TARGET_DB).toBe("openmonetis_db");
		expect(parsed.hostname).toBe("127.0.0.1");
		expect(parsed.port).toBe("55432");
		expect(parsed.pathname.replace(/^\//, "")).toBe("openmonetis_db");
		expect(result.rows[0].db).toBe("openmonetis_db");
		expect(result.rows[0].user).toBe("openmonetis");
	});
});
