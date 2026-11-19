-- Disposable schema for examples/docker-compose.yaml.
CREATE TABLE public.customers (
  id integer PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE public.orders (
  id integer PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES public.customers (id),
  total numeric(10, 2) NOT NULL
);

CREATE TABLE public.user_credentials (
  user_id integer PRIMARY KEY,
  password_hash text NOT NULL
);

INSERT INTO public.customers (id, name) VALUES (1, 'Ada'), (2, 'Grace');
INSERT INTO public.orders (id, customer_id, total) VALUES (10, 1, 42.00);
INSERT INTO public.user_credentials (user_id, password_hash) VALUES (1, 'not-for-the-agent');

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE ROLE mcp_readonly LOGIN PASSWORD 'mcp_readonly' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT CONNECT ON DATABASE app TO mcp_readonly;
GRANT USAGE ON SCHEMA public TO mcp_readonly;
GRANT SELECT ON public.customers, public.orders TO mcp_readonly;
