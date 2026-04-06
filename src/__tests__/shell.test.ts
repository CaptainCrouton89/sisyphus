import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shellQuote } from '../shared/shell.js';

describe('shellQuote', () => {
  it('wraps simple string in single quotes', () => {
    assert.equal(shellQuote('hello'), "'hello'");
  });

  it('escapes single quotes inside the string', () => {
    assert.equal(shellQuote("it's"), "'it'\\''s'");
  });

  it('handles empty string', () => {
    assert.equal(shellQuote(''), "''");
  });

  it('handles strings with spaces', () => {
    assert.equal(shellQuote('hello world'), "'hello world'");
  });

  it('handles strings with double quotes', () => {
    assert.equal(shellQuote('say "hello"'), "'say \"hello\"'");
  });

  it('handles strings with special shell characters', () => {
    assert.equal(shellQuote('$HOME'), "'$HOME'");
    assert.equal(shellQuote('a && b'), "'a && b'");
    assert.equal(shellQuote('foo|bar'), "'foo|bar'");
  });

  it('handles strings with multiple single quotes', () => {
    assert.equal(shellQuote("a'b'c"), "'a'\\''b'\\''c'");
  });

  it('handles strings with newlines', () => {
    assert.equal(shellQuote('line1\nline2'), "'line1\nline2'");
  });
});
