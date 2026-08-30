# Railway deployment and live warehouse connection

The application is portable because the UI persists only a **datasource profile**—provider, host, database name, authentication mode, and the name of an environment variable. It never writes a password, token, private key, or connection URI to an application record.

Deploy the repository as a Node service on Railway. Configure `DATABASE_URL` for the application database, then add the warehouse connection URI as a Railway environment variable such as `WAREHOUSE_CONNECTION_URL`. Create a dedicated read-only warehouse identity and restrict it to the schemas required for discovery and analysis. The datasource setup screen should reference the exact environment-variable name that you configure in Railway.

For a PostgreSQL-style connection, the environment value normally follows `postgresql://readonly_user:password@host:5432/database?sslmode=require`. Do not use an administrator account. For Snowflake, BigQuery, Databricks, and Redshift, use the provider's recommended service identity or token format and apply the least-privilege permissions necessary for read-only discovery and query execution.

Before switching from the representative commerce warehouse, test the datasource profile in the application. A configured secret moves the profile to **Policy review**; this makes the security boundary, requested discovery scope, and steward sign-off visible before live querying is enabled.
