SELECT 'CREATE DATABASE phonemail_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'phonemail_test')\gexec
