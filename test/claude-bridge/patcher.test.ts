import { describe, expect, it } from 'vitest';
import { applyPatches, isPatched } from '../../src/claude-bridge/patcher';

/**
 * [FORK] claude-bridge patcher — tests the pure transform (applyPatches/isPatched)
 * against a fixture mimicking the minified bundle's three anchor shapes. Filesystem
 * wrappers (locateBundle/applyPatch/restoreBundle) are covered by manual verification.
 */

// Minimal fixture matching the three anchor shapes in the minified Copilot bundle.
const fixture =
	'settings:{env:{ANTHROPIC_BASE_URL:`http://localhost:${d.port}`,' +
	'ANTHROPIC_AUTH_TOKEN:`${d.nonce}.${this.sessionId}`,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:1}},' +
	'model:o.modelId.toSdkModelId(),permissions:{}';

describe('claude-bridge patcher', () => {
	it('applies all three patches on a fresh bundle', () => {
		const result = applyPatches(fixture);
		expect(result.changed).toBe(true);
		expect(result.report).toEqual(['BASE_URL:1', 'AUTH_TOKEN:1', 'MODEL:1']);
		expect(result.out).toContain('ANTHROPIC_BASE_URL:(process.env.GLM_ANTHROPIC_BASE_URL||');
		expect(result.out).toContain('ANTHROPIC_AUTH_TOKEN:(process.env.GLM_ANTHROPIC_AUTH_TOKEN||');
		expect(result.out).toContain(
			'model:(process.env.GLM_ANTHROPIC_MODEL||o.modelId.toSdkModelId())',
		);
	});

	it('is idempotent — re-running a patched source is a no-op', () => {
		const once = applyPatches(fixture);
		const twice = applyPatches(once.out);
		expect(twice.changed).toBe(false);
		expect(twice.report).toEqual(['BASE_URL:0', 'AUTH_TOKEN:0', 'MODEL:0']);
		expect(twice.out).toBe(once.out);
	});

	it('isPatched detects the patched form', () => {
		expect(isPatched(fixture)).toBe(false);
		expect(isPatched(applyPatches(fixture).out)).toBe(true);
	});

	it('throws when an anchor matches more than once (count-guard, no silent failure)', () => {
		// A second MODEL anchor → must abort loudly.
		const dup = `${fixture} model:x.modelId.toSdkModelId()`;
		expect(() => applyPatches(dup)).toThrow(/MODEL.*matched 2/);
	});

	it('preserves the original localhost/nonce/picker values inside the fallback', () => {
		const out = applyPatches(fixture).out;
		expect(out).toContain('http://localhost:${d.port}');
		expect(out).toContain('${d.nonce}.${this.sessionId}');
		expect(out).toContain('o.modelId.toSdkModelId()');
	});
});
