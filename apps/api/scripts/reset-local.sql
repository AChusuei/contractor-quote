-- Reset local D1 database (drops all tables including migration tracking)
-- Safe to run in dev — never run against production.
DROP TABLE IF EXISTS data_deletion_log;
DROP TABLE IF EXISTS quote_activity;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS photos;
DROP TABLE IF EXISTS quotes;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS contractors;
DROP TABLE IF EXISTS super_users;
DROP TABLE IF EXISTS platform_admins;
DROP TABLE IF EXISTS d1_migrations;
