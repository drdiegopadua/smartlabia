import { prisma } from "../db/prisma";

interface ScheduleInput {
  contactId: string;
  scheduledAt: Date;
  notes?: string;
}

export async function scheduleAppointment({ contactId, scheduledAt, notes }: ScheduleInput) {
  return prisma.appointment.create({
    data: { contactId, scheduledAt, notes },
  });
}

export async function listUpcomingAppointments(contactId: string) {
  return prisma.appointment.findMany({
    where: { contactId, scheduledAt: { gte: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function cancelAppointment(appointmentId: string) {
  return prisma.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED" } });
}
