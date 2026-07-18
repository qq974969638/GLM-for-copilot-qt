import * as fs from 'node:fs/promises';
import vscode from 'vscode';
import { CONFIG_SECTION } from '../consts';
import { logger } from '../logger';
import type { GLMChatProvider } from '../provider';
import { getClaudeBridgeEnabled } from './config';
import { applyBridgeEnv } from './env';
import { applyPatch, isPatched, locateBundle, restoreBundle } from './patcher';

/**
 * [FORK] claude-bridge module entry.
 *
 * Owns: env injection (gated by `claudeBridge.enabled`), the `enabled`-toggle
 * listener, and the three management commands. Registered from
 * `runtime/lifecycle.ts` alongside the MCP module. Self-contained messages
 * (local bilingual helper) so this A-class module doesn't touch the global i18n.
 */

const isZh = vscode.env.language.toLowerCase() === 'zh-cn';
const msg = (en: string, zh: string): string => (isZh ? zh : en);

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function registerClaudeBridge(
	context: vscode.ExtensionContext,
	provider: GLMChatProvider,
): void {
	const refreshEnv = (): void => {
		void applyBridgeEnv(provider.authManager).catch((error) =>
			logger.warn('claude-bridge: env apply failed', error),
		);
	};

	refreshEnv();

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(`${CONFIG_SECTION}.claudeBridge.enabled`)) {
				refreshEnv();
			}
		}),
		vscode.commands.registerCommand('glm-copilot.claudeBridge.applyPatch', applyPatchCommand),
		vscode.commands.registerCommand('glm-copilot.claudeBridge.restoreBundle', restoreBundleCommand),
		vscode.commands.registerCommand('glm-copilot.claudeBridge.showStatus', showStatusCommand),
	);

	logger.info('claude-bridge module registered');
}

async function applyPatchCommand(): Promise<void> {
	const bundle = await locateBundle();
	if (!bundle) {
		void vscode.window.showErrorMessage(
			msg('Copilot bundle not found.', '未找到 Copilot 扩展 bundle。'),
		);
		return;
	}
	try {
		const result = await applyPatch(bundle);
		void vscode.window.showInformationMessage(
			result.changed
				? msg(
						'Claude bridge patch applied. Reload VS Code to activate.',
						'Claude 桥接补丁已应用，请重载 VS Code 生效。',
					)
				: msg(
						'Claude bridge patch already present (no change).',
						'Claude 桥接补丁已存在（无变化）。',
					),
		);
	} catch (error) {
		logger.error('claude-bridge applyPatch failed', error);
		void vscode.window.showErrorMessage(
			msg(`Patch failed: ${toErrorMessage(error)}`, `打补丁失败：${toErrorMessage(error)}`),
		);
	}
}

async function restoreBundleCommand(): Promise<void> {
	const bundle = await locateBundle();
	if (!bundle) {
		void vscode.window.showErrorMessage(
			msg('Copilot bundle not found.', '未找到 Copilot 扩展 bundle。'),
		);
		return;
	}
	try {
		await restoreBundle(bundle);
		void vscode.window.showInformationMessage(
			msg('Copilot bundle restored. Reload VS Code.', '已还原 Copilot bundle，请重载 VS Code。'),
		);
	} catch (error) {
		logger.error('claude-bridge restoreBundle failed', error);
		void vscode.window.showErrorMessage(
			msg(`Restore failed: ${toErrorMessage(error)}`, `还原失败：${toErrorMessage(error)}`),
		);
	}
}

async function showStatusCommand(): Promise<void> {
	const enabled = getClaudeBridgeEnabled();
	const bundle = await locateBundle();
	let patched = false;
	if (bundle) {
		try {
			patched = isPatched(await fs.readFile(bundle, 'utf8'));
		} catch {
			patched = false;
		}
	}
	void vscode.window.showInformationMessage(
		msg(
			`Claude Bridge — enabled: ${enabled}, patched: ${patched}${bundle ? '' : ' (bundle not found)'}`,
			`Claude 桥接 — 开关：${enabled ? '开' : '关'}，补丁：${patched ? '已应用' : '未应用'}${bundle ? '' : '（未找到 bundle）'}`,
		),
	);
}
