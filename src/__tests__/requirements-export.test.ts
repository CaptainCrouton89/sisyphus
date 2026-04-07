import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function createRequirementsFixture(): Record<string, unknown> {
  return {
    meta: {
      title: 'Authentication Requirements',
      subtitle: 'CLI export coverage',
      draft: 'v0.3',
      lastModified: '2026-04-07',
      summary: 'Deterministic markdown export for requirements review.',
    },
    groups: [
      {
        name: 'Login Flow',
        description: 'Requirements for initial sign-in.',
        context: 'Applies to the first-run terminal authentication path.',
        requirements: [
          {
            id: 'REQ-1',
            title: 'Prompt for credentials',
            status: 'draft',
            ears: {
              when: 'When the user selects sign in',
              shall: 'the CLI shall prompt for username and password',
            },
            criteria: [
              { text: 'Username prompt is shown', checked: true },
              { text: 'Password input is masked', checked: false },
            ],
          },
          {
            id: 'REQ-2',
            title: 'Explain validation errors',
            status: 'approved',
            ears: {
              if: 'If submitted credentials are invalid',
              shall: 'the CLI shall render a corrective error message',
            },
            criteria: [],
            agentNotes: 'Keep the copy actionable and avoid provider-specific wording.',
            userComment: 'Need this to mention retry guidance.',
          },
        ],
        safeAssumptions: [
          {
            id: 'SA-1',
            title: 'Session timeout default',
            status: 'draft',
            ears: {
              where: 'idle authenticated sessions exist',
              shall: 'the CLI shall expire idle authenticated sessions after 30 minutes',
            },
            criteria: [
              { text: 'Timeout is documented', checked: true },
            ],
            agentNotes: 'Thirty minutes is the current working default.',
          },
        ],
        openQuestions: [
          {
            id: 'OQ-1',
            question: 'Should failed login attempts be rate-limited?',
            options: [
              {
                title: 'Yes',
                description: 'Reduce brute-force risk with escalating delays.',
              },
            ],
            response: 'Yes, add a short backoff after repeated failures.',
          },
          {
            id: 'OQ-2',
            question: 'Should SSO be available on first release?',
            options: [],
            response: '',
          },
        ],
      },
    ],
  };
}

function runRequirementsExport(requirementsPath: string, force = false): Buffer {
  const command = [
    shellQuote(process.execPath),
    '--import',
    'tsx',
    shellQuote(cliEntry),
    'requirements',
    '--export',
    shellQuote(requirementsPath),
    ...(force ? ['--force'] : []),
  ].join(' ');

  return execSync(command, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('requirements export', () => {
  let tempDir: string;
  let requirementsPath: string;
  let markdownPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sisyphus-requirements-export-'));
    requirementsPath = join(tempDir, 'requirements.json');
    markdownPath = join(tempDir, 'requirements.md');
    writeFileSync(
      requirementsPath,
      JSON.stringify(createRequirementsFixture(), null, 2),
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('renders deterministic markdown from requirements.json', () => {
    const firstStdout = runRequirementsExport(requirementsPath).toString('utf-8').trim();
    assert.equal(firstStdout, markdownPath);

    const firstRender = readFileSync(markdownPath, 'utf-8');

    assert.match(firstRender, /# Authentication Requirements/);
    assert.match(firstRender, /## Login Flow/);
    assert.match(firstRender, /### REQ-1: Prompt for credentials/);
    assert.match(firstRender, /### REQ-2: Explain validation errors/);
    assert.match(firstRender, /When the user selects sign in, the CLI shall prompt for username and password/);
    assert.match(firstRender, /\*\*Status:\*\* draft/);
    assert.match(firstRender, /\*\*Status:\*\* approved/);
    assert.match(firstRender, /- \[x\] Username prompt is shown/);
    assert.match(firstRender, /- \[ \] Password input is masked/);
    assert.match(firstRender, /Keep the copy actionable and avoid provider-specific wording\./);
    assert.match(firstRender, /Need this to mention retry guidance\./);
    assert.match(firstRender, /### Safe Assumptions/);
    assert.match(firstRender, /### SA-1: Session timeout default/);
    assert.match(firstRender, /### Open Questions/);
    assert.match(firstRender, /Yes, add a short backoff after repeated failures\./);
    assert.match(firstRender, /\*\*Response:\*\* \(unanswered\)/);

    runRequirementsExport(requirementsPath);
    const secondRender = readFileSync(markdownPath, 'utf-8');
    assert.equal(secondRender, firstRender);
  });

  it('rejects hand-edited markdown unless force is provided', () => {
    runRequirementsExport(requirementsPath);

    writeFileSync(markdownPath, '# Hand-edited requirements\n', 'utf-8');

    assert.throws(
      () => runRequirementsExport(requirementsPath),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const execError = error as Error & { status?: number; stderr?: Buffer };
        assert.equal(execError.status, 1);
        assert.match(
          execError.stderr?.toString('utf-8') ?? '',
          /has been hand-edited \(differs from rendered output\)\./,
        );
        assert.match(
          execError.stderr?.toString('utf-8') ?? '',
          /Use --force to overwrite/,
        );
        return true;
      },
    );

    runRequirementsExport(requirementsPath, true);

    assert.ok(existsSync(markdownPath + '.bak'));
    assert.equal(readFileSync(markdownPath + '.bak', 'utf-8'), '# Hand-edited requirements\n');
    assert.notEqual(readFileSync(markdownPath, 'utf-8'), '# Hand-edited requirements\n');
  });
});
