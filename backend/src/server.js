import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Services
app.get("/api/services", async (_req, res) => {
  const services = await prisma.service.findMany({
    where: { active: true }, orderBy: { id: "asc" }
  });
  res.json(services);
});

app.post("/api/services", async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    durationMin: z.number().int().positive(),
    priceCents: z.number().int().nonnegative(),
    active: z.boolean().optional().default(true),
  });
  try {
    const data = schema.parse(req.body);
    const service = await prisma.service.create({ data });
    res.status(201).json(service);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Appointments
app.get("/api/appointments", async (req, res) => {
  const { from, to } = req.query;
  const where = {};
  if (from || to) where.startTs = {
    gte: from ? new Date(from) : undefined,
    lt: to ? new Date(to) : undefined
  };
  const appts = await prisma.appointment.findMany({
    where, orderBy: { startTs: "asc" },
    include: { customer: true, staff: true, service: true },
  });
  res.json(appts);
});

app.post("/api/appointments", async (req, res) => {
  const schema = z.object({
    customer: z.object({
      name: z.string(),
      email: z.string().email().optional(),
      phone: z.string().optional()
    }),
    staffId: z.number().int().positive(),
    serviceId: z.number().int().positive(),
    startTs: z.string(), // ISO string
    notes: z.string().optional(),
  });

  try {
    const { customer, staffId, serviceId, startTs, notes } = schema.parse(req.body);

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const start = new Date(startTs);
    const end = new Date(start.getTime() + service.durationMin * 60 * 1000);

    // Double-booking guard: any overlap for same staff?
const overlap = await prisma.appointment.findFirst({
  where: {
    staffId,
    NOT: [
      { endTs: { lte: start } },   // ends on/before start -> no overlap
      { startTs: { gte: end } }    // starts on/after end   -> no overlap
    ],
    status: { in: ["SCHEDULED"] },
  },
});
    if (overlap) return res.status(409).json({ error: "Time slot already booked for that staff member." });

    // Upsert customer by email if provided
    let customerId;
    if (customer.email) {
      const up = await prisma.customer.upsert({
        where: { email: customer.email },
        update: { name: customer.name, phone: customer.phone ?? undefined },
        create: { name: customer.name, email: customer.email, phone: customer.phone },
      });
      customerId = up.id;
    } else {
      const c = await prisma.customer.create({ data: { name: customer.name, phone: customer.phone } });
      customerId = c.id;
    }

    const appt = await prisma.appointment.create({
      data: { customerId, staffId, serviceId, startTs: start, endTs: end, notes },
      include: { customer: true, staff: true, service: true },
    });
    res.status(201).json(appt);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
