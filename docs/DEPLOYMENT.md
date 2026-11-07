# Deployment and Portability

Start in Replit, but maintain portable Git repo and reproducible environment definitions. Create separate staging/prod databases and secrets. Configure canonical domain `dashboard.npaustin.com` only after infrastructure and auth review.

Deployment must include: database migrations, health checks, background worker/scheduler, durable job queue, OAuth callback origin config, provider verification, asset storage, structured logs, backups and restore, alerting and rollback procedures. GitHub move should require infrastructure configuration, not rewriting product logic. Record exact commands and Replit limitations after the first scaffold is created.
