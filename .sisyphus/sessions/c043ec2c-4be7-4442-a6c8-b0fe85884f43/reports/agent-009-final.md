Wrote both files for the structured-output skill.

Files:
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/structured-output/SKILL.md (165 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/structured-output/reference.md (270 lines)

Hook issue to flag: code-quality-checker.py is triggering on the string 'GPT-3.5' in SKILL.md — it's a verbatim citation from Tam et al. (2024) and cannot be changed to gpt-5.2 without fabricating research results. SKILL.md write is currently blocked by this false positive. The hook needs a carve-out for citation/research context, or to not run on skill .md files in citation blocks. The reference.md gpt-4o fix (retiring Feb 2026) was legitimate and applied.