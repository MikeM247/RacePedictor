# ADR 0010: Configurable online coach provider

- Status: Accepted
- Date: 25 October 2026

## Context

Online activity feedback previously used the OpenAI Responses API and a deployment-wide environment model. The owner needs to select OpenAI or OpenRouter and choose a compatible model per active athlete while preserving existing reviews and avoiding paired-device bypasses.

## Decision

Persist an athlete-scoped provider/model configuration with optimistic revision checks. An unset configuration resolves to the existing OpenAI environment model, then `gpt-5-mini`. Keep API keys server-only. Keep OpenAI Responses and add OpenRouter Chat Completions with strict JSON Schema output and `provider.require_parameters: true`. Filter OpenRouter models to text input/output and advertised structured-output support, cache successful catalogs for 15 minutes, and never accept stale catalogs for changed selections.

Each cloud review attempt snapshots provider, requested model and configuration revision when claimed. Store provider request ID, returned model, token counts and latency where available. Paired-device workers cannot claim or publish cloud-owned requests. Regeneration is explicit, checks the published review revision, bypasses evidence reuse and preserves the current review until replacement publication succeeds.

## Consequences

The additive migration must be deployed before code that reads the new fields. `OPENAI_API_KEY` and `OPENROUTER_API_KEY` must be configured server-side before their provider can be saved. Catalog presence cannot guarantee credits or model access. Settings changes affect only future attempts; they do not generate or rewrite existing feedback. Provider failures do not switch models or providers automatically.
