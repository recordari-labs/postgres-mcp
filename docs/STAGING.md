# Despliegue en staging de Recordari

v0.1 no se anuncia como producto público hasta que este checklist pase contra una base de staging real y un cliente MCP real (Cursor o Claude).

## 1. Rol de base de datos

En la base de staging, con un usuario administrador:

```bash
psql "$ADMIN_DATABASE_URL" -f examples/sql/create_mcp_readonly_role.sql
```

Edita antes los `GRANT SELECT` para que apunten solo a tablas o vistas aprobadas. El usuario de `DATABASE_URL` debe ser `mcp_readonly`, nunca el owner de la aplicación.

## 2. Política

Parte de `examples/config.restricted.yaml`. Ajusta `schemas.allow` y `tables.allow` al esquema real. Monta el fichero en solo lectura. No escribas la contraseña ni el token dentro del YAML: usa `${DATABASE_URL}` y `${MCP_TOKEN}`.

`security.http.allowedHosts` debe incluir el hostname con el que Cursor llega al puerto (sin el puerto). Si publicas el contenedor solo en `127.0.0.1`, los valores por defecto valen.

## 3. Contenedor

En una red privada de staging, sin publicar el puerto a Internet:

```bash
docker run -d \
  --name postgres-mcp \
  --network staging-network \
  -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e MCP_TOKEN="$MCP_TOKEN" \
  -v ./config.yaml:/app/config.yaml:ro \
  recordari/postgres-mcp:0.1.0
```

Comprueba `GET http://127.0.0.1:3000/healthz`. Un YAML inválido debe dejar el contenedor en exit code 1.

## 4. Cliente

Añade `examples/cursor/mcp.json` al proyecto, con el token de staging. Pregunta qué tablas hay y ejecuta un `SELECT` pequeño. Confirma que una tabla denegada no aparece en `list_tables` y que un `JOIN` hacia ella falla.

## 5. Criterio para el tag v0.1.0

- La suite `npm test` y `npm run test:integration` está en verde en CI.
- El agente de staging responde con datos reales y no puede leer secretos conocidos.
- No hay falsos rechazos que impidan el uso diario en las consultas `SELECT` habituales.

Hasta entonces la imagen puede existir, pero no se presenta como "secure by default" fuera de Recordari.
