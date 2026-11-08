# Future data workers

This directory reserves the boundary for separately deployed workers.
The API currently hosts a bounded Planning Center page executor for existing
Admin-enabled syncs. It does not create recurring syncs or require a separate
worker service. Durable requests and page cursors remain in PostgreSQL.
Future Python ingestion/statistical workers will use documented interfaces and
PostgreSQL, not import frontend code or duplicate business rules.
Do not add a queue or microservice until the relevant roadmap phase justifies it.
