import { sendOwnerBookingEmail, sendCustomerConfirmationEmail } from "./mailer.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import Stripe from "stripe";
import dayjs from "dayjs";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// =====================================
// STRIPE WEBHOOK
// IMPORTANT: must be BEFORE express.json()
// =====================================
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      const signature = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      try {
        const session = event.data.object;
        const md = session.metadata || {};

        const customer = {
          name: md.customerName,
          email: md.customerEmail || undefined,
          phone: md.customerPhone || undefined,
        };

        const staffId = Number(md.staffId);
        const serviceId = Number(md.serviceId);
        const start = new Date(md.startTs);

        const service = await prisma.service.findUnique({
          where: { id: serviceId },
        });

        if (!service) {
          console.error("Webhook error: service not found");
          return res.json({ received: true });
        }

        const end = new Date(start.getTime() + service.durationMin * 60 * 1000);

        const overlap = await prisma.appointment.findFirst({
          where: {
            staffId,
            NOT: [
              { endTs: { lte: start } },
              { startTs: { gte: end } },
            ],
            status: { in: ["SCHEDULED"] },
          },
        });

        if (overlap) {
          console.error("Webhook booking creation blocked: slot already taken");
          return res.json({ received: true, conflict: true });
        }

        const existing = await prisma.appointment.findFirst({
          where: {
            staffId,
            serviceId,
            startTs: start,
            customer: customer.email ? { email: customer.email } : undefined,
          },
          include: {
            customer: true,
            service: true,
            staff: true,
          },
        });

        if (existing) {
          return res.json({ received: true, duplicate: true });
        }

        let customerId;
        let savedCustomer;

        if (customer.email) {
          savedCustomer = await prisma.customer.upsert({
            where: { email: customer.email },
            update: {
              name: customer.name,
              phone: customer.phone ?? undefined,
            },
            create: {
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
            },
          });
          customerId = savedCustomer.id;
        } else {
          savedCustomer = await prisma.customer.create({
            data: {
              name: customer.name,
              phone: customer.phone,
            },
          });
          customerId = savedCustomer.id;
        }

        const appt = await prisma.appointment.create({
          data: {
            customerId,
            staffId,
            serviceId,
            startTs: start,
            endTs: end,
            notes: md.notes || undefined,
          },
          include: {
            customer: true,
            staff: true,
            service: true,
          },
        });

        await sendOwnerBookingEmail({
          appointment: appt,
          customer: appt.customer,
          service: appt.service,
          staff: appt.staff,
        });

        await sendCustomerConfirmationEmail({
          appointment: appt,
          customer: appt.customer,
          service: appt.service,
          staff: appt.staff,
        });
      } catch (err) {
        console.error("Webhook booking creation failed:", err);
      }
    }

    res.json({ received: true });
  }
);

// =====================================
// NORMAL APP MIDDLEWARE
// =====================================
app.use(cors());
app.use(express.json());

// =====================================
// ADMIN MIDDLEWARE
// =====================================
function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");
  if (!process.env.ADMIN_KEY) {
    return res.status(500).json({ error: "ADMIN_KEY not set on server" });
  }
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// =====================================
// SERVICES
// =====================================
app.get("/api/services", async (_req, res) => {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
  });
  res.json(services);
});

app.post("/api/services", requireAdmin, async (req, res) => {
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

// =====================================
// CLOSED DAYS
// =====================================
app.get("/api/closed-days", async (_req, res) => {
  try {
    const rows = await prisma.closedDay.findMany({
      orderBy: { day: "asc" },
    });

    res.json(
      rows.map((row) => ({
        id: row.id,
        day: dayjs(row.day).format("YYYY-MM-DD"),
        note: row.note || "",
      }))
    );
  } catch (e) {
    res.status(500).json({ error: "Failed to load closed days" });
  }
});

app.post("/api/admin/closed-days/toggle", requireAdmin, async (req, res) => {
  try {
    const schema = z.object({
      day: z.string(),
      note: z.string().optional(),
    });

    const { day, note } = schema.parse(req.body);
    const parsedDay = new Date(`${day}T00:00:00.000Z`);

    const existing = await prisma.closedDay.findFirst({
      where: { day: parsedDay },
    });

    if (existing) {
      await prisma.closedDay.delete({
        where: { id: existing.id },
      });
      return res.json({ ok: true, closed: false });
    }

    await prisma.closedDay.create({
      data: {
        day: parsedDay,
        note: note || undefined,
      },
    });

    res.json({ ok: true, closed: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// =====================================
// PUBLIC APPOINTMENTS READ ENDPOINT
// =====================================
app.get("/api/appointments", async (req, res) => {
  const { from, to } = req.query;
  const where = {};

  if (from || to) {
    where.startTs = {
      gte: from ? new Date(from) : undefined,
      lt: to ? new Date(to) : undefined,
    };
  }

  const appts = await prisma.appointment.findMany({
    where,
    orderBy: { startTs: "asc" },
    include: { customer: true, staff: true, service: true },
  });

  res.json(appts);
});

// =====================================
// STRIPE CHECKOUT SESSION CREATION
// =====================================
app.post("/api/create-checkout-session", async (req, res) => {
  const schema = z.object({
    customer: z.object({
      name: z.string(),
      email: z.string().email(),
      phone: z.string().optional(),
    }),
    staffId: z.number().int().positive(),
    serviceId: z.number().int().positive(),
    startTs: z.string(),
    notes: z.string().optional(),
  });

  try {
    const { customer, staffId, serviceId, startTs, notes } = schema.parse(req.body);

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const bookingDay = dayjs(startTs).format("YYYY-MM-DD");
    const closedDays = await prisma.closedDay.findMany();
    const closedDateStrings = closedDays.map((d) => dayjs(d.day).format("YYYY-MM-DD"));

    if (closedDateStrings.includes(bookingDay)) {
      return res.status(409).json({ error: "Sorry, we are closed on this date." });
    }

    const start = new Date(startTs);
    const end = new Date(start.getTime() + service.durationMin * 60 * 1000);

    const overlap = await prisma.appointment.findFirst({
      where: {
        staffId,
        NOT: [
          { endTs: { lte: start } },
          { startTs: { gte: end } },
        ],
        status: { in: ["SCHEDULED"] },
      },
    });

    if (overlap) {
      return res
        .status(409)
        .json({ error: "Time slot already booked for that staff member." });
    }

    const depositAmount = Number(process.env.DEPOSIT_AMOUNT_PENCE || 1000);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customer.email,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `EB StyledIt Deposit - ${service.name}`,
              description: "Non-refundable booking deposit",
            },
            unit_amount: depositAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/booking-cancelled`,
      metadata: {
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone || "",
        staffId: String(staffId),
        serviceId: String(serviceId),
        startTs,
        notes: notes || "",
      },
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error("Checkout session creation failed:", e);
    res.status(400).json({ error: e.message });
  }
});

// =====================================
// LEGACY DIRECT BOOKING ROUTE
// =====================================
app.post("/api/appointments", async (req, res) => {
  const schema = z.object({
    customer: z.object({
      name: z.string(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    }),
    staffId: z.number().int().positive(),
    serviceId: z.number().int().positive(),
    startTs: z.string(),
    notes: z.string().optional(),
  });

  try {
    const { customer, staffId, serviceId, startTs, notes } = schema.parse(req.body);

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const bookingDay = dayjs(startTs).format("YYYY-MM-DD");
    const closedDays = await prisma.closedDay.findMany();
    const closedDateStrings = closedDays.map((d) => dayjs(d.day).format("YYYY-MM-DD"));

    if (closedDateStrings.includes(bookingDay)) {
      return res.status(409).json({ error: "Sorry, we are closed on this date." });
    }

    const start = new Date(startTs);
    const end = new Date(start.getTime() + service.durationMin * 60 * 1000);

    const overlap = await prisma.appointment.findFirst({
      where: {
        staffId,
        NOT: [
          { endTs: { lte: start } },
          { startTs: { gte: end } },
        ],
        status: { in: ["SCHEDULED"] },
      },
    });

    if (overlap) {
      return res
        .status(409)
        .json({ error: "Time slot already booked for that staff member." });
    }

    let customerId;
    let savedCustomer;

    if (customer.email) {
      savedCustomer = await prisma.customer.upsert({
        where: { email: customer.email },
        update: {
          name: customer.name,
          phone: customer.phone ?? undefined,
        },
        create: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
      });
      customerId = savedCustomer.id;
    } else {
      savedCustomer = await prisma.customer.create({
        data: {
          name: customer.name,
          phone: customer.phone,
        },
      });
      customerId = savedCustomer.id;
    }

    const appt = await prisma.appointment.create({
      data: {
        customerId,
        staffId,
        serviceId,
        startTs: start,
        endTs: end,
        notes,
      },
      include: {
        customer: true,
        staff: true,
        service: true,
      },
    });

    sendOwnerBookingEmail({
      appointment: appt,
      customer: appt.customer,
      service: appt.service,
      staff: appt.staff,
    }).catch(console.error);

    sendCustomerConfirmationEmail({
      appointment: appt,
      customer: appt.customer,
      service: appt.service,
      staff: appt.staff,
    }).catch(console.error);

    res.status(201).json(appt);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// =====================================
// ADMIN APPOINTMENTS
// =====================================
app.get("/api/admin/appointments", requireAdmin, async (req, res) => {
  try {
    const items = await prisma.appointment.findMany({
      where: { status: "SCHEDULED" },
      orderBy: { startTs: "asc" },
      include: {
        customer: true,
        service: true,
        staff: true,
      },
    });

    res.json(
      items.map((a) => ({
        id: a.id,
        startTs: a.startTs,
        endTs: a.endTs,
        status: a.status,
        notes: a.notes,
        customer: {
          id: a.customer.id,
          name: a.customer.name,
          email: a.customer.email,
          phone: a.customer.phone,
        },
        service: {
          id: a.service.id,
          name: a.service.name,
          category: a.service.category,
        },
        staff: {
          id: a.staff.id,
          name: a.staff.name,
        },
      }))
    );
  } catch (e) {
    res.status(500).json({ error: "Failed to load appointments" });
  }
});

app.patch("/api/admin/appointments/:id/cancel", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  try {
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    res.json({ ok: true, appointment: updated });
  } catch (e) {
    res.status(500).json({ error: "Failed to cancel appointment" });
  }
});

app.patch("/api/admin/appointments/:id/complete", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  try {
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    res.json({ ok: true, appointment: updated });
  } catch (e) {
    res.status(500).json({ error: "Failed to complete appointment" });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));