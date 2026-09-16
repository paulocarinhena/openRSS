CREATE TABLE "new_app_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'app',
    "bootstrapAdminEmail" TEXT,
    "allowRegistration" BOOLEAN NOT NULL DEFAULT false,
    "refreshIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "defaultAiProviderId" TEXT,
    "defaultAiModel" TEXT
);

INSERT INTO "new_app_settings" (
    "id",
    "bootstrapAdminEmail",
    "allowRegistration",
    "refreshIntervalMinutes",
    "retentionDays",
    "defaultAiProviderId",
    "defaultAiModel"
)
SELECT
    "id",
    "bootstrapAdminEmail",
    "allowRegistration",
    "refreshIntervalMinutes",
    CASE WHEN "retentionDays" = 60 THEN 90 ELSE "retentionDays" END,
    "defaultAiProviderId",
    "defaultAiModel"
FROM "app_settings";

DROP TABLE "app_settings";
ALTER TABLE "new_app_settings" RENAME TO "app_settings";
