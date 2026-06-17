# Evals

This folder holds contract-level eval cases that call MCP tools with fixed inputs.

## Case format

Each case is a JSON object:

- `server`: docker-compose service name
- `tool`: MCP tool name
- `input`: tool arguments
- `expect.contains`: a substring that must appear in the serialized tool response

