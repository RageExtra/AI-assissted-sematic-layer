import { ensureDemoCommerceData } from "./demoData";

export async function runSeed() {
  console.log("[Seeder] Starting demo commerce data seeding...");
  try {
    await ensureDemoCommerceData();
    console.log("[Seeder] Demo commerce data seeded successfully.");
  } catch (error) {
    console.error("[Seeder] Error seeding demo commerce data:", error);
  }
}

