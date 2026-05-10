import nodemailer from "nodemailer";

export function makeTransport() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("Email env vars missing");
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

export async function sendOwnerBookingEmail({ appointment, customer, service, staff }) {
  const transport = makeTransport();
  if (!transport) {
    console.log("No transport created for owner email");
    return;
  }

  const to = process.env.OWNER_NOTIFY_EMAIL || process.env.EMAIL_USER;

  const start = new Date(appointment.startTs);
  const end = new Date(appointment.endTs);

  const subject = `New booking: ${service.name} (${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;

  const text = `
New appointment booked ✅

Service: ${service.name} (${service.category})
Staff: ${staff?.name || `ID ${appointment.staffId}`}

Customer:
- Name: ${customer.name}
- Email: ${customer.email || "-"}
- Phone: ${customer.phone || "-"}

Time:
- Start: ${start.toString()}
- End: ${end.toString()}

Notes:
${appointment.notes || "-"}

Appointment ID: ${appointment.id}
`;

  const info = await transport.sendMail({
    from: `"EB StyledIt Bookings" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
  });

  console.log("Owner email sent:", info.response);
}

export async function sendCustomerConfirmationEmail({ appointment, customer, service, staff }) {
  if (!customer?.email) {
    console.log("No customer email provided, skipping confirmation email");
    return;
  }

  const transport = makeTransport();
  if (!transport) {
    console.log("No transport created for customer email");
    return;
  }

  const start = new Date(appointment.startTs);
  const end = new Date(appointment.endTs);

  const subject = `Your EB StyledIt appointment is confirmed ✨`;

  const text = `
Hi ${customer.name},

Your booking with EB StyledIt has been confirmed.

Appointment details:
- Service: ${service.name}
- Category: ${service.category}
- Stylist: ${staff?.name || "EB StyledIt"}
- Date: ${start.toLocaleDateString()}
- Time: ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
- Ends: ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}

Notes:
${appointment.notes || "-"}

Important:
- £10 non-refundable deposit is deducted from the total
- Remaining balance must be paid in cash
- Hair must be washed, clean, and detangled
- 48-hour notice required for cancellations
- £10 late fee after 15 minutes; after 30 minutes the appointment may be cancelled

Thank you for booking with EB StyledIt 💛
`;

  const info = await transport.sendMail({
    from: `"EB StyledIt" <${process.env.EMAIL_USER}>`,
    to: customer.email,
    subject,
    text,
  });

  console.log("Customer confirmation email sent:", info.response);
}