#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-012' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-012-plugin" --agent 'devcore:programmer' --session-id "720fd6e9-ef29-4002-a2ce-528070dd3f0e" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills write-eval-devcore:programmer c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-012-system.md')" '/authoring:skills /authoring:prompting-effectively

Write SKILL.md and reference.md for the eval-and-quality-gates authoring skill.

## Inputs to Read

1. Research report: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-eval-quality-gates.md
2. Format spec: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/format-reference.md
3. Style target SKILL.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/SKILL.md
4. Style target reference.md: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/output-variety/reference.md
5. Second style target: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/SKILL.md
6. Second style target reference: /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/prompting-effectively/reference.md

Read ALL of these before writing anything.

## Output Files

Write to:
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/eval-and-quality-gates/SKILL.md (~150-200 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/eval-and-quality-gates/reference.md (~150-250 lines)

## SKILL.md Requirements

- YAML frontmatter: `name: eval-and-quality-gates`, `description:` with trigger keywords (e.g. "evaluation", "quality gates", "LLM-as-judge", "prompt testing", "regression testing", "guardrails", "evals")
- Overview: why evaluation is hard — LLM outputs are probabilistic, traditional test assertions don'\''t work, you need layered validation
- Practical sections: LLM-as-judge (when it works, when it doesn'\''t), the three-layer validation hierarchy (structural → semantic → quality), prompt regression testing, metrics that work vs metrics that are theater, production monitoring
- Link to reference.md for depth
- Key data: LLM-as-judge 85% agreement with humans (Zheng et al. 2023), position/verbosity bias issues

## reference.md Requirements

- Code examples: promptfoo YAML config, LLM-as-judge implementation (TypeScript/Python), Zod validation pipeline, CI quality gate
- Framework comparison: promptfoo, RAGAS, DeepEval, Braintrust — when to use which
- Quality gate patterns: structural validation, semantic checks, quality scoring with confidence thresholds
- Prompt regression testing pipeline: version control, golden sets, assertion suites, CI/CD integration
- Guardrails: Constitutional Classifiers (86%→4.4% jailbreak), NeMo Guardrails, defense-in-depth
- Metrics guide: what works (task-specific) vs what doesn'\''t (BLEU, ROUGE, perplexity)
- Cite Zheng et al. (2023), CALM framework, Hamel Husain'\''s methodology, RAGAS faithfulness

## Voice & Quality

Practitioner voice. This topic is plagued by hype — be especially direct about what doesn'\''t work. "Metrics that are theater" should be a clear call-out. Code examples must be production-realistic. Cite specific numbers throughout.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %251