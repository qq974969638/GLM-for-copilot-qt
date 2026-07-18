import type { AuthManager } from '../auth';
import { resolveDefaultConnection } from '../config';
import { resolveAnthropicBaseUrl, resolveEndpointRegion } from '../endpoint';
import { getActiveWorkspaceFolderResource } from '../workspace';
import { getClaudeBridgeEnabled } from './config';

/**
 * [FORK] claude-bridge env injection.
 *
 * Publishes GLM's Anthropic endpoint + coding key + forced model into
 * `process.env` so the patched Copilot Claude session repoints its Claude Code
 * SDK at GLM. Gated by `claudeBridge.enabled` (soft kill-switch): when off, the
 * env vars are deleted so the (patched) bundle falls back to original Copilot.
 *
 * Migrated out of `GLMChatProvider.applyClaudeBridgeEnv` (spike) into this module.
 */

/** Every env var this module owns (so the kill-switch can clean them all). */
const ENV_KEYS = [
	'GLM_ANTHROPIC_BASE_URL',
	'GLM_ANTHROPIC_AUTH_TOKEN',
	'GLM_ANTHROPIC_MODEL',
	'ANTHROPIC_DEFAULT_SONNET_MODEL',
	'ANTHROPIC_DEFAULT_OPUS_MODEL',
	'ANTHROPIC_DEFAULT_HAIKU_MODEL',
	'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
	'API_TIMEOUT_MS',
] as const;

/**
 * Apply (or clear) the bridge env vars based on the `claudeBridge.enabled` setting.
 * No-op (returns) when enabled but no API key is configured — leave original Copilot.
 */
export async function applyBridgeEnv(authManager: AuthManager): Promise<void> {
	if (!getClaudeBridgeEnabled()) {
		clearBridgeEnv();
		return;
	}
	const resource = getActiveWorkspaceFolderResource();
	const connection = resolveDefaultConnection(resource);
	const apiKey = await authManager.getApiKey(connection.credentialChannel, resource);
	if (!apiKey) {
		return;
	}
	// Region follows the default connection (CN → open.bigmodel.cn, intl → api.z.ai).
	process.env.GLM_ANTHROPIC_BASE_URL = resolveAnthropicBaseUrl(
		resolveEndpointRegion(connection.endpoint),
	);
	process.env.GLM_ANTHROPIC_AUTH_TOKEN = apiKey;
	// Force z.ai's recommended flagship (glm-5.2[1m] = GLM-5.2, 1M context).
	// Without this the patched session sends the picker's disguised Claude name and
	// z.ai's server-side mapping is opaque. (Phase B proxy will take over model
	// rewriting; this env var will then be unset so the proxy maps picker→GLM.)
	process.env.GLM_ANTHROPIC_MODEL = 'glm-5.2[1m]';
	// Match z.ai's official Claude Code template — sub-agent tiers + long context:
	process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'glm-5.2[1m]';
	process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = 'glm-5.2[1m]';
	process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = 'glm-4.7';
	process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '1000000';
	process.env.API_TIMEOUT_MS = '3000000';
}

/** Soft kill-switch: remove all bridge env vars so the bundle reverts to original Copilot. */
export function clearBridgeEnv(): void {
	for (const key of ENV_KEYS) {
		delete process.env[key];
	}
}
