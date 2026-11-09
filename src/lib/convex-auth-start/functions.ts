import { createServerFn } from "@tanstack/react-start";

export const getAuthToken = createServerFn({ method: "GET" }).handler(async () => {
	const { readAuthToken } = await import("./server");
	return await readAuthToken();
});
