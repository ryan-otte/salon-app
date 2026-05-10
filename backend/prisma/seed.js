// prisma/seed.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Clear existing services (keeps IDs starting fresh)
  await prisma.service.deleteMany({});

  // MEN
  const mens = [
    "Box Braids / Twists",
    "Half Cornrows + Half Braids/Twists",
    "Cornrows",
    "Locs",
    "Barrel Twists",
    "Plug Twists",
  ];

  // WOMEN
  const womens = [
    "Knotless Braids / Braids / Passion Twists",
    "Stitch Braids",
    "Fulani Braids",
    "Locs",
    "Freestyle Hairstyles",
  ];

  const all = [...mens, ...womens].map((name) => ({
    name,
    durationMin: 0,
    priceCents: 0,
    active: true,
  }));

  await prisma.service.createMany({ data: all });

  console.log(`Seeded ${all.length} services `);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
