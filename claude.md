# Claude Code Preferences

## Code Style
- Follow Airbnb style guide for JavaScript/TypeScript
- Use 2 spaces for indentation
- Maximum line length: 80 characters

## Comments & Documentation
- Make each action clear
- Avoid obvious comments
- Explain "why" not "what" in comments
- Keep TODO comments with ticket references

## Git Practices
- Write clear, concise commit messages
- Use conventional commits format: `feat:`, `fix:`, `docs:`, etc.

## Frameworks & Libraries
- All suiteQl queries belong in a single library

## Don't Do
- Don't use `var` - always use `const` or `let`
- Don't commit commented-out code

## Logging
- make a clear log.debug statement whenever a record is written to or saved
- don't log evaluations that require no work to be done