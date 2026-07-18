import vscode from 'vscode';
import { CONFIG_SECTION } from '../consts';

/**
 * [FORK] claude-bridge: whether the GLM-backed Claude session bridge is enabled.
 *
 * Soft kill-switch. When `false` (default) the bridge injects NO env vars, so the
 * (patched) Copilot bundle falls back to its original values → original Copilot
 * Claude behavior. When `true`, env injection repoints the Claude Code SDK at GLM.
 * See `沟通文档/claude-for-glm/01-设计方案-claude-bridge.md`.
 */
export function getClaudeBridgeEnabled(): boolean {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<boolean>('claudeBridge.enabled', false);
}
