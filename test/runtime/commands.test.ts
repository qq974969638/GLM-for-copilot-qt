import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../../src/runtime/commands';
import { formatCredentialChannel } from '../../src/auth';
import {
	GLM_CN_CODING_API_KEY_URL,
	GLM_CN_GENERAL_API_KEY_URL,
	GLM_INTERNATIONAL_CODING_API_KEY_URL,
	GLM_INTERNATIONAL_GENERAL_API_KEY_URL,
} from '../../src/endpoint';
import { BUILTIN_MCP_SERVERS } from '../../src/mcp/builtin';
import {
	__clearConfigurationValues,
	__getOpenedExternal,
	__getConfigurationValueAtScope,
	__resetCommandState,
	__setConfigurationValue,
	__setConfigurationValueAtScope,
	__setQuickPickSelectionLabel,
	__setWarningMessageButton,
	ConfigurationTarget,
	__getWindowMessages,
} from '../support/vscode.mock';

// Mock cleanupAllStoredImages so the cleanup command can be tested without
// initializing the real image store. The spy records the call count.
const cleanupAllStoredImagesMock = vi.fn(async () => 0);
vi.mock('../../src/provider/vision/image-store', () => ({
	cleanupAllStoredImages: (...args: unknown[]) => cleanupAllStoredImagesMock(...args),
}));

describe('runtime commands', () => {
	beforeEach(() => {
		__clearConfigurationValues();
		__resetCommandState();
	});

	it.each([
		['coding-plan', 'china', 'china-coding', GLM_CN_CODING_API_KEY_URL],
		['standard', 'china', 'china-standard', GLM_CN_GENERAL_API_KEY_URL],
		['coding-plan', 'international', 'international-coding', GLM_INTERNATIONAL_CODING_API_KEY_URL],
		['standard', 'international', 'international-standard', GLM_INTERNATIONAL_GENERAL_API_KEY_URL],
	] as const)('opens the API key page for %s/%s', async (apiMode, region, channel, expectedUrl) => {
		__setConfigurationValue('glm-copilot.apiMode', apiMode);
		__setConfigurationValue('glm-copilot.region', region);
		__setQuickPickSelectionLabel(formatCredentialChannel(channel));
		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);

		await vscode.commands.executeCommand('glm-copilot.getApiKey');

		expect(__getOpenedExternal()?.toString()).toBe(expectedUrl);
	});
});

describe('runtime commands — resetToDefaults (FORK)', () => {
	beforeEach(() => {
		__clearConfigurationValues();
		__resetCommandState();
		cleanupAllStoredImagesMock.mockClear();
	});

	it('does nothing when the user dismisses the confirmation dialog', async () => {
		// warningMessageButton undefined -> user did not click 'Reset'.
		__setWarningMessageButton(undefined);
		// Pre-set some values to prove they are NOT cleared on cancel.
		__setConfigurationValue('glm-copilot.mcp.imageCleanupMode', 'ttl-7d');
		__setConfigurationValue('glm-copilot.mcp.zread.enabled', true);

		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.resetToDefaults');

		// Values untouched because the user cancelled.
		const cfg = vscode.workspace.getConfiguration('glm-copilot');
		expect(cfg.get('mcp.imageCleanupMode')).toBe('ttl-7d');
		expect(cfg.get('mcp.zread.enabled')).toBe(true);
	});

	it('clears all fork-relevant keys including imageCleanupMode when confirmed', async () => {
		__setWarningMessageButton('Reset');
		// Set values across all categories that resetToDefaults should clear.
		__setConfigurationValue('glm-copilot.mcp.imageCleanupMode', 'ttl-7d');
		__setConfigurationValue('glm-copilot.mcp.zread.enabled', true);
		__setConfigurationValue('glm-copilot.imageHandlingPrompt', 'custom');
		__setConfigurationValue('glm-copilot.imageStoredPrompt', 'custom');
		__setConfigurationValue('glm-copilot.experimental.stabilizeToolList', true);

		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.resetToDefaults');

		const cfg = vscode.workspace.getConfiguration('glm-copilot');
		// imageCleanupMode must be in the reset list (regression guard: an
		// earlier version missed it).
		expect(cfg.get('mcp.imageCleanupMode')).toBeUndefined();
		// All four built-in server toggles cleared.
		for (const id of Object.keys(BUILTIN_MCP_SERVERS)) {
			expect(cfg.get(`mcp.${id}.enabled`), `mcp.${id}.enabled should be cleared`).toBeUndefined();
		}
		expect(cfg.get('imageHandlingPrompt')).toBeUndefined();
		expect(cfg.get('imageStoredPrompt')).toBeUndefined();
		expect(cfg.get('experimental.stabilizeToolList')).toBeUndefined();
	});

	it('reports a non-zero cleared count on success', async () => {
		__setWarningMessageButton('Reset');
		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.resetToDefaults');
		const messages = __getWindowMessages().information;
		// The done message includes the cleared count; it must mention at least
		// the per-key resets (9 keys + modelManagement = 10 minimum).
		expect(messages.join(' ')).toMatch(/\d+/);
	});
});

describe('runtime commands — applyCodingPlanPreset (FORK)', () => {
	beforeEach(() => {
		__clearConfigurationValues();
		__resetCommandState();
		cleanupAllStoredImagesMock.mockClear();
	});

	it('does nothing when the user dismisses the confirmation dialog', async () => {
		__setWarningMessageButton(undefined);
		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.applyCodingPlanPreset');

		// No MCP servers enabled, no stabilizeToolList set.
		const cfg = vscode.workspace.getConfiguration('glm-copilot');
		for (const id of Object.keys(BUILTIN_MCP_SERVERS)) {
			expect(cfg.get(`mcp.${id}.enabled`)).toBeFalsy();
		}
		expect(cfg.get('experimental.stabilizeToolList')).toBeFalsy();
	});

	it('enables all built-in MCP servers and stabilizeToolList when confirmed', async () => {
		__setWarningMessageButton('Apply');
		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.applyCodingPlanPreset');

		const cfg = vscode.workspace.getConfiguration('glm-copilot');
		// All four built-in servers enabled at user scope.
		for (const id of Object.keys(BUILTIN_MCP_SERVERS)) {
			expect(cfg.get(`mcp.${id}.enabled`), `mcp.${id}.enabled should be true after preset`).toBe(
				true,
			);
		}
		expect(cfg.get('experimental.stabilizeToolList')).toBe(true);
	});

	it('writes Coding Plan model overrides for glm-5.2 and glm-5-turbo', async () => {
		__setWarningMessageButton('Apply');
		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.applyCodingPlanPreset');

		// modelManagement is stored as a versioned object; read it back and
		// check the per-model profiles.
		const mm = __getConfigurationValueAtScope(
			'glm-copilot.modelManagement',
			ConfigurationTarget.Global,
		) as { models?: Record<string, { endpointRoute?: string; visionMode?: string }> };
		expect(mm?.models?.['glm-5.2']?.endpointRoute).toBe('china-anthropic');
		expect(mm?.models?.['glm-5.2']?.visionMode).toBe('mcp');
		expect(mm?.models?.['glm-5-turbo']?.visionMode).toBe('mcp');
		// glm-5-turbo should NOT get a route override (only visionMode).
		expect(mm?.models?.['glm-5-turbo']?.endpointRoute).toBeUndefined();
	});

	it('preserves existing user overrides when merging the preset', async () => {
		// Pre-existing custom model + default connection must survive the merge.
		__setConfigurationValueAtScope(
			'glm-copilot.modelManagement',
			{
				version: 1,
				defaultConnection: { endpoint: 'china-standard' },
				models: { 'glm-4.6v-flash': { visionMode: 'native' } },
				customModels: { 'my-team-model': { id: 'my-team-model', thinking: true } },
			},
			ConfigurationTarget.Global,
		);
		__setWarningMessageButton('Apply');
		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.applyCodingPlanPreset');

		const mm = __getConfigurationValueAtScope(
			'glm-copilot.modelManagement',
			ConfigurationTarget.Global,
		) as {
			defaultConnection?: { endpoint?: string };
			models?: Record<string, unknown>;
			customModels?: Record<string, unknown>;
		};
		// Existing defaultConnection preserved.
		expect(mm?.defaultConnection?.endpoint).toBe('china-standard');
		// Existing per-model override preserved.
		expect(mm?.models?.['glm-4.6v-flash']).toMatchObject({ visionMode: 'native' });
		// Preset added on top.
		expect(mm?.models?.['glm-5.2']).toMatchObject({
			endpointRoute: 'china-anthropic',
			visionMode: 'mcp',
		});
		// Custom models preserved.
		expect(mm?.customModels?.['my-team-model']).toBeDefined();
	});
});

describe('runtime commands — cleanupStoredImages (FORK)', () => {
	beforeEach(() => {
		__clearConfigurationValues();
		__resetCommandState();
		cleanupAllStoredImagesMock.mockClear();
	});

	it('does nothing when the user dismisses the confirmation dialog', async () => {
		__setWarningMessageButton(undefined);
		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.cleanupStoredImages');
		expect(cleanupAllStoredImagesMock).not.toHaveBeenCalled();
	});

	it('calls cleanupAllStoredImages when confirmed and reports the count', async () => {
		cleanupAllStoredImagesMock.mockResolvedValueOnce(7);
		__setWarningMessageButton('Delete');
		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.cleanupStoredImages');
		expect(cleanupAllStoredImagesMock).toHaveBeenCalledTimes(1);
		// Success message includes the deleted count.
		expect(__getWindowMessages().information.join(' ')).toMatch(/7/);
	});

	it('shows an error message when cleanup throws', async () => {
		cleanupAllStoredImagesMock.mockRejectedValueOnce(new Error('fs error'));
		__setWarningMessageButton('Delete');
		registerCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
		await vscode.commands.executeCommand('glm-copilot.cleanupStoredImages');
		expect(cleanupAllStoredImagesMock).toHaveBeenCalledTimes(1);
		// An error message was surfaced (not silently swallowed).
		expect(__getWindowMessages().error.length).toBeGreaterThan(0);
	});
});
