import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clipAnsi, writeClipped, createFrameBuffer } from '../tui/render.js';

describe('clipAnsi', () => {
  it('strips control characters from content', () => {
    const result = clipAnsi('hello\nworld', 20);
    assert.ok(!result.includes('\n'), 'newline should be stripped');
    assert.ok(result.includes('helloworld'), 'text around newline preserved');
  });

  it('strips tabs and other control chars', () => {
    const result = clipAnsi('a\tb\rc', 20);
    assert.ok(!result.includes('\t'), 'tab should be stripped');
    assert.ok(!result.includes('\r'), 'CR should be stripped');
    assert.ok(result.includes('abc'));
  });

  it('preserves ANSI escape sequences', () => {
    const result = clipAnsi('\x1b[31mred\x1b[0m', 10);
    assert.ok(result.includes('\x1b[31m'));
    assert.ok(result.includes('red'));
  });
});

describe('writeClipped', () => {
  it('strips newlines from frame buffer lines', () => {
    const buf = createFrameBuffer(40, 3);
    writeClipped(buf, 0, 1, 'line1\nline2\nline3', 40);
    assert.ok(!buf.lines[1]!.includes('\n'), 'frame buffer line must not contain newlines');
    assert.ok(buf.lines[1]!.includes('line1line2line3'));
  });

  it('handles daemon timeout error message', () => {
    const buf = createFrameBuffer(80, 2);
    const errorMsg = `\x1b[31m⚠ Request timed out after 8s. The daemon may be overloaded.\n  Check: sisyphus doctor\n  Logs: tail -20 ~/.sisyphus/daemon.log\x1b[0m`;
    writeClipped(buf, 1, 0, errorMsg, 78);
    assert.ok(!buf.lines[0]!.includes('\n'), 'error message newlines must be stripped');
  });
});
