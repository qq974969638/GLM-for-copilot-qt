import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthManager } from '../../src/auth';
import { __clearConfigurationValues, __setConfigurationValue } from '../support/vscode.mock';

// resolveDefaultConnection reads the real model-management config; stub it so the
// test only exercises env injection + the enabled switch. (vi.mock is hoisted.)
vi.mock('../../src/config', () => ({
	resolveDefaultConnection: () => ({
		endpoint: 'china-coding',
		credentialChannel: 'china-coding',
		baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
		route: 'default',
		protocol: 'openai',
		apiMode: 'coding-plan',
		pricingCurrency: 'CNY',
		usesGlobalBaseUrlOverride: false,
	}),
}));

import { applyBridgeEnv, clearBridgeEnv } from '../../src/claude-bridge/env';

const authWithKey = (key: string | undefined): AuthManager =>
	({ getApiKey: async () => key }) as unknown as AuthManager;

describe('claude-bridge env injection', () => {
	beforeEach(() => {
		__clearConfigurationValues();
		clearBridgeEnv();
	});

	it('injects env vars when enabled and a key is configured', async () => {
		__setConfigurationValue('glm-copilot.claudeBridge.enabled', true);
		await applyBridgeEnv(authWithKey('test-key'));
		expect(process.env.GLM_ANTHROPIC_BASE_URL).toBe('https://open.bigmodel.cn/api/anthropic');
		expect(process.env.GLM_ANTHROPIC_AUTH_TOKEN).toBe('test-key');
		expect(process.env.GLM_ANTHROPIC_MODEL).toBe('glm-5.2[1m]');
		expect(process.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('glm-5.2[1m]');
		expect(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('1000000');
	});

	it('clears env vars when disabled (soft kill-switch)', async () => {
		__setConfigurationValue('glm-copilot.claudeBridge.enabled', true);
		await applyBridgeEnv(authWithKey('test-key'));
		expect(process.env.GLM_ANTHROPIC_BASE_URL).toBeDefined();

		__setConfigurationValue('glm-copilot.claudeBridge.enabled', false);
		await applyBridgeEnv(authWithKey('test-key'));
		expect(process.env.GLM_ANTHROPIC_BASE_URL).toBeUndefined();
		expect(process.env.GLM_ANTHROPIC_AUTH_TOKEN).toBeUndefined();
		expect(process.env.GLM_ANTHROPIC_MODEL).toBeUndefined();
	});

	it('no-ops (leaves env unset) when enabled but no key is configured', async () => {
		__setConfigurationValue('glm-copilot.claudeBridge.enabled', true);
		await applyBridgeEnv(authWithKey(undefined));
		expect(process.env.GLM_ANTHROPIC_BASE_URL).toBeUndefined();
		expect(process.env.GLM_ANTHROPIC_AUTH_TOKEN).toBeUndefined();
	});
});
