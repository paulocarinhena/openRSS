ALTER TABLE "app_settings" ALTER COLUMN "retentionDays" SET DEFAULT 90;
UPDATE "app_settings" SET "retentionDays" = 90 WHERE "retentionDays" = 60;
