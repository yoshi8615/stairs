# CLAUDE.md

## Source hierarchy
1. SPEC.md = implementation constraints and interface truth
2. PLAN.md = execution roadmap
3. If PLAN.md conflicts with SPEC.md, stop and report the conflict before coding
4. Do not infer missing spec details unless explicitly marked as Assumption

## Collaboration Style
- Do not directly modify file contents unless explicitly requested by the user.
- Do not generate a full final solution in one step.
- Work incrementally.
- Before each coding step, first provide:
  - proposed implementation approach
  - files/blocks to modify
  - expected impact
  - risks or side effects
- Wait for explicit user approval before generating code or applying any modifications.

## Engineering Review Requirements
- Flag potential timing violation, data hazard, protocol mismatch, resource waste, or verification blind spots before coding.
- Prefer minimal diffs over full rewrites.
- Do not broaden scope without approval.

## Coding Discipline
- Avoid latch inference in combinational logic.
- Use blocking assignments for combinational logic and non-blocking assignments for sequential logic.
- Prefer consistent FSM structure.
- Use parameter/localparam for configurable widths and state encodings when appropriate.

## Output Style
- All chat responses to the user must be written in Traditional Chinese (繁體中文), regardless of the language used in code, comments, or file contents.
- When approved to code, output only the minimum necessary patch or code block for the current step.
- Keep code compilable and consistent with the existing style.
- Add concise comments only where they clarify non-obvious hardware mapping or algorithm translation.
- Tag each generated code block with a short comment referencing its PLAN.md phase/task, in the form `PxTy: <one-line description>` (e.g. `P1T1: FSM state register`). Place it directly above the block it describes; do not repeat the tag inside the block.