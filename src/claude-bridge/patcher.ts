import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import vscode from 'vscode';

/**
 * [FORK] claude-bridge patcher.
 *
 * Rewrites three spots in the built-in Copilot extension bundle so its Claude
 * Code SDK reads GLM values from `process.env.GLM_*` (with a fallback to the
 * original values). Each anchor targets a stable string shape and tolerates
 * minified-variable-name churn. Idempotent: re-running only fills in missing
 * patches; the count-guard aborts loudly (never silently) if an anchor drifts.
 *
 * Pure transform (`applyPatches`) is split from the filesystem wrappers so it
 * can be unit-tested with fixture strings.
 */
const PATCHES = [
	{
		name: 'BASE_URL',
		re: /(ANTHROPIC_BASE_URL):(`http:\/\/localhost:\$\{[^}]+\}`)/g,
		repl: (_m: string, label: string, tmpl: string) =>
			`${label}:(process.env.GLM_${label}||${tmpl})`,
	},
	{
		name: 'AUTH_TOKEN',
		re: /(ANTHROPIC_AUTH_TOKEN):(`\$\{[^}]+\}\.\$\{[^}]+\}`)/g,
		repl: (_m: string, label: string, tmpl: string) =>
			`${label}:(process.env.GLM_${label}||${tmpl})`,
	},
	{
		name: 'MODEL',
		re: /(model:)([A-Za-z_$][A-Za-z_$0-9]*)\.modelId\.toSdkModelId\(\)/g,
		repl: (_m: string, pre: string, v: string) =>
			`${pre}(process.env.GLM_ANTHROPIC_MODEL||${v}.modelId.toSdkModelId())`,
	},
] as const;

export interface PatchResult {
	/** Patched source (identical to input when nothing changed). */
	out: string;
	/** Whether at least one anchor was wrapped this run. */
	changed: boolean;
	/** Per-patch match counts, e.g. `["BASE_URL:0", "AUTH_TOKEN:0", "MODEL:1"]`. */
	report: string[];
}

/**
 * Apply all patches to a bundle source string. Idempotent and pure.
 * Throws if any anchor matches more than once (bundle layout changed → manual review).
 */
export function applyPatches(src: string): PatchResult {
	let out = src;
	const report: string[] = [];
	let changed = false;
	for (const p of PATCHES) {
		p.re.lastIndex = 0;
		let n = 0;
		const replaced = out.replace(p.re, (m, ...args) => {
			n++;
			return p.repl(m, ...(args as string[]));
		});
		report.push(`${p.name}:${n}`);
		if (n > 1) {
			throw new Error(
				`claude-bridge: anchor '${p.name}' matched ${n} sites (expected 0 or 1); Copilot bundle layout changed — aborting without writing. Manual review needed.`,
			);
		}
		if (n === 1) {
			out = replaced;
			changed = true;
		}
	}
	return { out, changed, report };
}

/** Whether the BASE_URL patch is already present in `src`. */
export function isPatched(src: string): boolean {
	return /process\.env\.GLM_ANTHROPIC_BASE_URL/.test(src);
}

/** Locate the Copilot extension bundle (local desktop or Remote-SSH/WSL server). */
export async function locateBundle(): Promise<string | undefined> {
	const candidates: string[] = [];
	// Local desktop: <install>/<ver>/resources/app/extensions/copilot/dist/extension.js
	// (`vscode.env.appRoot` = …/resources/app; in remote it points at the server root.)
	candidates.push(path.join(vscode.env.appRoot, 'extensions', 'copilot', 'dist', 'extension.js'));
	// Remote (Remote-SSH / WSL / Dev Container): ~/.vscode-server/bin/<commit>/extensions/…
	// (no `resources/app` layer), plus user-installed under ~/.vscode-server/extensions/.
	const serverBin = path.join(os.homedir(), '.vscode-server', 'bin');
	try {
		for (const entry of await fs.readdir(serverBin)) {
			candidates.push(path.join(serverBin, entry, 'extensions', 'copilot', 'dist', 'extension.js'));
		}
	} catch {
		// Not a remote setup (no ~/.vscode-server/bin) — local candidates only.
	}
	candidates.push(
		path.join(os.homedir(), '.vscode-server', 'extensions', 'copilot', 'dist', 'extension.js'),
	);
	for (const candidate of candidates) {
		try {
			await fs.access(candidate);
			return candidate;
		} catch {
			// try next
		}
	}
	return undefined;
}

/**
 * Apply the patch to the bundle at `bundlePath`. Backs up to `extension.js.bak`
 * on first run. No write (but still returns the report) when already patched.
 */
export async function applyPatch(bundlePath: string): Promise<PatchResult> {
	const backupPath = `${bundlePath}.bak`;
	try {
		await fs.access(backupPath);
	} catch {
		await fs.copyFile(bundlePath, backupPath);
	}
	const src = await fs.readFile(bundlePath, 'utf8');
	const result = applyPatches(src);
	if (result.changed) {
		await fs.writeFile(bundlePath, result.out, 'utf8');
	}
	return result;
}

/** Restore the bundle from `extension.js.bak`. Throws if no backup exists. */
export async function restoreBundle(bundlePath: string): Promise<void> {
	const backupPath = `${bundlePath}.bak`;
	await fs.copyFile(backupPath, bundlePath);
}
