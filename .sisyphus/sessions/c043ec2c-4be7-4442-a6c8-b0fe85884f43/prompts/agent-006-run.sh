#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-006' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-006-plugin" --agent 'sisyphus:research-lead' --session-id "ed02e758-82f3-479b-9ce6-62f850a77d72" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills research-eval-research-lead c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-006-system.md')" 'Research the topic: **Evaluation and Quality Gates for LLM Systems — Testing, Metrics, and Guardrails**

This research will be used to write an authoring skill (instructional reference material for prompt engineers building reliable LLM systems). Focus on practical, evidence-backed knowledge.

## What to research

1. **LLM-as-judge**: using models to evaluate model outputs. Calibration, bias, agreement with human evaluators. Papers and practical findings.
2. **Evaluation frameworks**: promptfoo, RAGAS, DeepEval, Braintrust, LangSmith. What design decisions did they make? What metrics do they compute?
3. **Quality gate patterns**: how to build automated quality gates in LLM pipelines — output validation, confidence thresholds, fallback strategies.
4. **Prompt regression testing**: how to detect when prompt changes break existing behavior. Snapshot testing, eval suites, CI integration.
5. **Metrics that matter**: accuracy, faithfulness, relevance, toxicity, format compliance. Which metrics are actually useful vs theater.
6. **Human evaluation**: when LLM-as-judge fails and you need humans. Annotation guidelines, inter-rater reliability.
7. **Production monitoring**: detecting drift, quality degradation over time, alerting on output quality.
8. **Guardrails and safety**: constitutional AI, output filtering, content moderation as quality gates.

## Sources to find
- Papers: LLM-as-judge (Zheng et al.), RAGAS, evaluation benchmarks
- Anthropic docs on evaluation, constitutional AI
- OpenAI evals framework and documentation
- Hamel Husain'\''s blog posts on LLM evaluation
- Eugene Yan'\''s writing on evaluation
- promptfoo documentation and blog
- Twitter/X threads from ML engineers on eval practices
- Reddit/HN discussions on LLM testing

## Output
Save to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-eval-quality-gates.md

Structure: Key Findings → LLM-as-Judge (with citations) → Evaluation Frameworks → Quality Gate Patterns → Regression Testing → Metrics Guide → Production Monitoring → Notable Sources (with URLs) → Code Examples'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %242