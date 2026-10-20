\getenv db_name POSTGRES_DB
\getenv migrator_password POSTGRES_MIGRATOR_PASSWORD
\getenv runtime_password POSTGRES_RUNTIME_PASSWORD
\getenv project_id RENOVA_DB_PROJECT_ID

CREATE ROLE renova_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'migrator_password';
CREATE ROLE renova_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'runtime_password';
ALTER DATABASE :"db_name" OWNER TO renova_migrator;
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO renova_migrator, renova_runtime;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO renova_migrator;
GRANT USAGE ON SCHEMA public TO renova_runtime;
ALTER ROLE renova_runtime SET statement_timeout = '5s';
ALTER ROLE renova_runtime SET lock_timeout = '5s';
CREATE SCHEMA renova_bootstrap;
CREATE TABLE renova_bootstrap.identity (project_id text PRIMARY KEY);
INSERT INTO renova_bootstrap.identity VALUES (:'project_id');
GRANT USAGE ON SCHEMA renova_bootstrap TO renova_migrator;
GRANT SELECT ON renova_bootstrap.identity TO renova_migrator;
