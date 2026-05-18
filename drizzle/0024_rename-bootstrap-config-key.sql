-- Rename the config_kv row holding course-create-mode config (budget, etc.)
UPDATE config_kv SET key = 'course-create' WHERE key = 'bootstrap';
