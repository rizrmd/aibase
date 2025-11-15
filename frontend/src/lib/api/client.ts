import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { AppRouter } from '$backend/orpc/router';

/**
 * oRPC client for type-safe API calls to backend
 * Uses Vite proxy to avoid CORS issues in development
 */
const getBaseURL = () => {
	// In browser, use current origin
	if (typeof window !== 'undefined') {
		return `${window.location.origin}/orpc`;
	}
	// In SSR, use relative path
	return 'http://localhost:5050/orpc';
};

const link = new RPCLink({
	url: getBaseURL()
});

// @ts-expect-error - oRPC type compatibility issue between server and client
export const client = createORPCClient<AppRouter>(link);
