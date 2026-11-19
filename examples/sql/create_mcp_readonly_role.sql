-- Least-privilege role for postgres-mcp.
-- Edit the names below, then run as the database owner:
--   psql "$ADMIN_DATABASE_URL" -f examples/sql/create_mcp_readonly_role.sql
--
-- YAML can only narrow what this role can already read.

CREATE ROLE mcp_readonly LOGIN PASSWORD 'replace-me' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE app TO mcp_readonly;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO mcp_readonly;

-- Grant SELECT only on relations the agent may read.
-- Do not grant the sensitive tables, and do not grant views that read them.
GRANT SELECT ON TABLE public.customers TO mcp_readonly;
GRANT SELECT ON TABLE public.orders TO mcp_readonly;
