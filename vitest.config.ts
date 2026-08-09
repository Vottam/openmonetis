import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^@\//,
				replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/`,
			},
		],
	},
	test: {
		globals: true,
		environment: "node",
		setupFiles: ["./vitest.setup.ts"],
		include: ["src/features/loans/**/*.test.ts"],
		testTimeout: 30000,
	},
});
