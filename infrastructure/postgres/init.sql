-- Runs once when the volume is first created.
-- A separate database for the API e2e tests so they never touch dev data.
CREATE DATABASE studywidbuddy_test OWNER studywidbuddy;
CREATE DATABASE studywidbuddy_shadow OWNER studywidbuddy;
