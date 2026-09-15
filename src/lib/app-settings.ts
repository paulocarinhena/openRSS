import "server-only";
import { db } from "@/lib/db";

export async function getAppSettings() {
  return db.appSettings.upsert({ where: { id: "app" }, create: { id: "app" }, update: {} });
}

export async function getUserSettings(userId: string) {
  return db.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
}
