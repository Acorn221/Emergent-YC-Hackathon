import { Storage } from "@plasmohq/storage";

const storage = new Storage({
	area: "sync",
});

const API_KEY_STORAGE_KEY = "emergent-api-key";

/**
 * Get the stored API key
 * @returns The API key or null if not set
 */
export const getApiKey = async (): Promise<string | null> => {
	const key = await storage.get<string>(API_KEY_STORAGE_KEY);
	return key || null;
};

/**
 * Store the API key
 * @param key The API key to store
 */
export const setApiKey = async (key: string): Promise<void> => {
	await storage.set(API_KEY_STORAGE_KEY, key);
};

/**
 * Check if an API key exists
 * @returns True if an API key is stored, false otherwise
 */
export const hasApiKey = async (): Promise<boolean> => {
	const key = await getApiKey();
	return key !== null && key.trim().length > 0;
};

