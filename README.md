# Project State MCP

Durable memory of decisions, assumptions, blockers, next moves, and build plans across Charles's projects. Exposes a single MCP endpoint that any Claude client (claude.ai, Claude Code, API clients) can call to read and write project state.

## Why this exists

Chats hit context limits. Project work spans 15+ chats. Handing context off manually via markdown docs is brittle and doesn't scale. This MCP is the substrate: every chat bootstraps from the database, writes back at the end. No more "seven chats deep and losing track."

## Architecture

- **Database:** Dedicated Supabase project (`project-state`), separate from any app's database
- **Server:** Single Vercel serverless function exposing a JSON-RPC MCP endpoint
- **Auth:** Bearer token shared secret (set as `MCP_SHARED_SECRET` env var)
- **Protocol:** MCP over HTTP, same pattern as Charles's existing `github-mcp-server-chooch333-style`

## Tools exposed

| Tool | Purpose |
|------|---------|
| `list_projects` | List all tracked projects |
| `get_project_state` | Full current state for one project (bootstrap call) |
| `create_project` | Register a new project |
| `log_decision` | Record a closed decision with rationale |
| `supersede_decision` | Replace an old decision with a new one |
| `add_assumption` | Record an active assumption |
| `update_assumption` | Confirm or invalidate an assumption |
| `add_blocker` | Log an open question or dependency |
| `resolve_blocker` | Close a blocker with an answer |
| `add_next_move` | Add a next action |
| `complete_next_move` | Mark a next move done |
| `write_plan` | Store a build plan document |
| `update_plan_status` | Transition plan through lifecycle |
| `get_plan` | Retrieve a plan by id or latest for project |
| `write_status_snapshot` | Write a narrative status summary |

## Deployment — step by step

### 1. Create the Supabase project (~3 minutes)

1. Go to [supabase.com](https://supabase.com), click **New project**
2. Name: `project-state`
3. Region: whatever is closest
4. Save the database password somewhere safe
5. Wait for provisioning (~1-2 min)
6. Once provisioned, go to **SQL Editor** → **New query**
7. Paste the contents of `02-migration.sql` → **Run**
8. Verify with: `select table_name from information_schema.tables where table_schema = 'public' order by table_name;` — should list all seven tables

### 2. Collect the keys (~1 minute)

From the Supabase project, copy:
- **Project URL** (Settings → API → Project URL)
- **service_role key** (Settings → API → service_role — NOT anon; this server needs full access)
- **Project ID** (Settings → General → Reference ID)

Save these somewhere — you'll paste them into Vercel in a moment.

### 3. Push this repo to GitHub (~2 minutes)

From the directory containing these files:

```bash
git init
git add .
git commit -m "Initial commit: project state MCP"
gh repo create project-state-mcp --private --source=. --push
```

(If `gh` isn't set up: create a new private repo on github.com named `project-state-mcp`, then `git remote add origin ...` and `git push -u origin main`.)

### 4. Deploy to Vercel (~3 minutes)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `project-state-mcp` repo
3. Framework: **Other** (Vercel will auto-detect the serverless function)
4. Before deploying, expand **Environment Variables** and add:
   - `SUPABASE_URL` = the Project URL from step 2
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role key from step 2
   - `MCP_SHARED_SECRET` = generate a strong random string (e.g. `openssl rand -hex 32`)
5. Click **Deploy**
6. Note the deployed URL, e.g. `https://project-state-mcp-chooch333.vercel.app`

Your MCP endpoint is: `https://project-state-mcp-chooch333.vercel.app/api/mcp`

### 5. Smoke-test the endpoint

```bash
curl -X POST https://project-state-mcp-chooch333.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SHARED_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You should see the 15 tools listed in the response.

### 6. Connect it to Claude clients

**In claude.ai:**
1. Settings → Connectors → Add custom connector
2. URL: `https://project-state-mcp-chooch333.vercel.app/api/mcp`
3. Auth: Bearer token, paste the shared secret
4. Save

**In Claude Code** (via the config):
Add to `~/.claude/config.json` (or equivalent, depending on Claude Code version):
```json
{
  "mcpServers": {
    "project-state": {
      "type": "http",
      "url": "https://project-state-mcp-chooch333.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SHARED_SECRET"
      }
    }
  }
}
```

### 7. Seed with Family Trip App data

Open a new chat (or Claude Code session) with the MCP connected. Paste the contents of `03-seed-family-trip-app.md` and ask Claude to use the MCP tools to populate the database.

## Directory layout

```
project-state-mcp/
├── api/
│   └── mcp.ts              # JSON-RPC endpoint (the whole MCP server)
├── lib/
│   ├── supabase.ts         # DB client + project resolver
│   ├── tools.ts            # Tool schemas exposed to clients
│   └── handlers.ts         # Tool implementations
├── 01-schema-design.md     # Rationale for the schema
├── 02-migration.sql        # Run this in Supabase SQL Editor
├── 03-seed-family-trip-app.md  # Initial data for the pilot project
├── 04-usage-guide.md       # How to use the MCP in daily work
├── package.json
├── tsconfig.json
├── vercel.json
└── .gitignore
```

## Security notes

- The service role key has full DB access — keep it only in Vercel env vars, never commit
- The shared secret prevents random callers from writing to your state — rotate it if ever exposed
- This MCP has no rate limiting or audit logging beyond Supabase's built-in; add if needed later
- RLS policies are not used here because this is a single-user tool; if ever shared, revisit

## Known limitations

- No full-text search yet. Add pg_trgm + indexes on `statement`, `title`, `content` if needed.
- No pagination on list endpoints. Fine for dozens of rows per project; revisit at hundreds.
- `list_projects` returns everything every call. Fine today, revisit when scale matters.
