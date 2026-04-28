# Codex Usage

## Initial commands

1. Unzip this pack into a fresh repository root.
2. Commit the documents.
3. Open Codex in the repository root.
4. Ask Codex to summarize AGENTS and skills.
5. Use prompts from `docs/12_CODEX_PROMPTS.md`.

## First local git commands

```bash
git init
git add .
git commit -m "docs: initialize world forge codex context"
```

## First Codex prompt

```txt
현재 로드한 AGENTS.md 지시사항과 사용 가능한 repo skills를 요약해줘. 파일 수정은 하지 마.
```

## Then

Use:

```txt
$world-forge-planner
...
```

from `docs/12_CODEX_PROMPTS.md`.

## Review cadence

After every 1–2 implementation prompts, run:

```txt
$world-forge-reviewer
...
```

Do not let Codex implement many phases without review.
