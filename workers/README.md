# Future data workers

Phase 0 reserves this boundary; no workers, schedulers or sync jobs run yet.
Future Python ingestion/statistical workers will use documented interfaces and
PostgreSQL, not import frontend code or duplicate business rules.
Do not add a queue or microservice until the relevant roadmap phase justifies it.
