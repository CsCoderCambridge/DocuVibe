# Graph Report - DocuVibe  (2026-10-31)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 237 nodes · 517 edges · 11 communities (7 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `127c70cf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7

## God Nodes (most connected - your core abstractions)
1. `get_conn()` - 20 edges
2. `run_vision_pipeline()` - 18 edges
3. `compilerOptions` - 16 edges
4. `run_civic_agent()` - 14 edges
5. `_execute_tool()` - 13 edges
6. `chat_with_fallback()` - 13 edges
7. `_row()` - 10 edges
8. `agent_voice()` - 10 edges
9. `HomePage()` - 9 edges
10. `react` - 9 edges

## Surprising Connections (you probably didn't know these)
- `_llm_error()` --uses--> `LLMUnavailableError`  [INFERRED]
  backend/main.py → backend/services/groq_client.py
- `_execute_tool()` --calls--> `chat_with_fallback()`  [EXTRACTED]
  backend/agents/civic_agent.py → backend/services/groq_client.py
- `run_civic_agent()` --calls--> `chat_with_fallback()`  [EXTRACTED]
  backend/agents/civic_agent.py → backend/services/groq_client.py
- `agent_chat()` --calls--> `run_civic_agent()`  [EXTRACTED]
  backend/main.py → backend/agents/civic_agent.py
- `agent_voice()` --calls--> `run_civic_agent()`  [EXTRACTED]
  backend/main.py → backend/agents/civic_agent.py

## Import Cycles
- None detected.

## Communities (11 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (46): DEFAULT_MODELS, errorMessage(), HomePage(), newId(), AgentTraceLog(), DEFAULT_META, TOOL_META, DEMO_SAMPLES (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (36): dependencies, lucide-react@^0.460.0, next@^15.5.0, react@^19.0.0, react-dom@^19.0.0, react-markdown@^9.0.1, remark-gfm@^4.0.0, devDependencies (+28 more)

### Community 2 - "Community 2"
Cohesion: 0.22
Nodes (24): _execute_tool(), run_civic_agent(), _system_prompt(), add_field(), attach_logs_to_document(), create_document(), get_action_items(), get_agent_logs() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (16): validate_config(), ActionItemUpdate, agent_chat(), agent_voice(), ChatRequest, FieldUpdate, get_document(), health() (+8 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (10): _now_ms(), transcribe_audio(), _env(), chat_with_fallback(), get_client(), LLMUnavailableError, parse_json(), _should_fall_back() (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (13): _clamp_confidence(), crop_and_reexamine_region(), _encode_image(), _load_image(), _normalize_fields(), _now_ms(), persist_document_to_sqlite(), run_vision_pipeline() (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08106473079249849 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06219512195121951 - nodes in this community are weakly interconnected._
- **Why does `run_vision_pipeline()` connect `Community 5` to `Community 2`, `Community 3`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.10752688172043011 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.1339031339031339 - nodes in this community are weakly interconnected._