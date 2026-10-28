import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import { notifyUsers, userIdsWithRole } from "../notifications/notificationService.js";
import type { CreateFeedbackBody, ListFeedbackQuery, PurgeQuery, UpdateFeedbackBody } from "./feedbackSchemas.js";

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const LIST_LIMIT = 300;

/** Identifies the image by its first bytes so a renamed file cannot be stored as a picture. */
export function sniffImageType(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const authorSelect = { select: { id: true, name: true, role: true, department: { select: { name: true, code: true } } } } as const;

function present<T extends { _count?: { images: number } }>(row: T) {
  const { _count, ...rest } = row;
  return { ...rest, imageCount: _count?.images ?? 0 };
}

/** Everyone signed in can read the list, so duplicates are easy to spot. Image bytes are never part of it. */
export async function listFeedback(q: ListFeedbackQuery) {
  const where: Prisma.FeedbackWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.type) where.type = q.type;
  if (q.page) where.page = q.page;
  if (q.archived === "false") where.archivedAt = null;
  if (q.archived === "true") where.archivedAt = { not: null };
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: "insensitive" } },
      { description: { contains: q.q, mode: "insensitive" } },
      { page: { contains: q.q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.feedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    include: { user: authorSelect, _count: { select: { images: true } } },
  });
  return rows.map(present);
}

export async function getFeedback(id: string) {
  const row = await prisma.feedback.findUnique({
    where: { id },
    include: {
      user: authorSelect,
      _count: { select: { images: true } },
      images: { select: { id: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) throw notFound("Feedback not found");
  return present(row);
}

export async function createFeedback(userId: string, body: CreateFeedbackBody, files: Express.Multer.File[]) {
  if (files.length > MAX_IMAGES) throw badRequest(`Attach at most ${MAX_IMAGES} pictures`);
  const images = files.map((f) => {
    const type = sniffImageType(f.buffer);
    if (!type) throw badRequest(`${f.originalname || "A file"} is not a PNG, JPEG or WebP picture`);
    return { mimeType: type, size: f.buffer.length, data: f.buffer };
  });
  const created = await prisma.feedback.create({
    data: { userId, ...body, images: { create: images } },
    select: { id: true },
  });
  void notifyUsers(await userIdsWithRole("ADMIN"), {
    type: "FEEDBACK",
    title: (n) => (n === 1 ? "New feedback" : `${n} new feedback items`),
    body: body.title,
    link: "/feedback",
    groupKey: "feedback-new",
  }, { exceptUserId: userId });
  return getFeedback(created.id);
}

export async function updateFeedback(id: string, body: UpdateFeedbackBody, actorId?: string) {
  const before = await prisma.feedback.findUnique({ where: { id }, select: { userId: true, title: true, status: true, adminNote: true } });
  const data: Prisma.FeedbackUpdateInput = {};
  if (body.status) data.status = body.status;
  if (body.adminNote !== undefined) data.adminNote = body.adminNote?.trim() ? body.adminNote.trim() : null;
  if (body.archived !== undefined) data.archivedAt = body.archived ? new Date() : null;
  try {
    await prisma.feedback.update({ where: { id }, data });
  } catch {
    throw notFound("Feedback not found");
  }
  if (before) {
    const statusChanged = body.status !== undefined && body.status !== before.status;
    const note = body.adminNote !== undefined ? (body.adminNote?.trim() || null) : before.adminNote;
    const noteChanged = body.adminNote !== undefined && note !== before.adminNote;
    if (statusChanged || noteChanged) {
      const label = statusChanged ? `is now ${String(body.status).toLowerCase().replace(/_/g, " ")}` : "has a new note";
      void notifyUsers([before.userId], {
        type: "FEEDBACK",
        title: "Your feedback was updated",
        body: `"${before.title}" ${label}${noteChanged && note ? `: ${note}` : ""}`,
        link: "/feedback",
      }, { exceptUserId: actorId });
    }
  }
  return getFeedback(id);
}

export async function deleteFeedback(id: string) {
  const res = await prisma.feedback.deleteMany({ where: { id } });
  if (res.count === 0) throw notFound("Feedback not found");
}

export async function getImage(id: string) {
  const img = await prisma.feedbackImage.findUnique({ where: { id }, select: { mimeType: true, data: true } });
  if (!img) throw notFound("Picture not found");
  return img;
}

export async function deleteImage(id: string) {
  const res = await prisma.feedbackImage.deleteMany({ where: { id } });
  if (res.count === 0) throw notFound("Picture not found");
}

function purgeWhere(q: PurgeQuery): Prisma.FeedbackImageWhereInput {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - q.olderThanMonths);
  const where: Prisma.FeedbackImageWhereInput = { createdAt: { lt: cutoff } };
  if (q.closedOnly === "true") {
    // Only pictures of finished work: done, declined or archived. Open items keep their screenshots.
    where.feedback = { OR: [{ status: { in: ["DONE", "DECLINED"] } }, { archivedAt: { not: null } }] };
  }
  return where;
}

/** How much space the pictures use and how much a clean-up would free. */
export async function imageStorage(q: PurgeQuery) {
  const [all, purgeable] = await Promise.all([
    prisma.feedbackImage.aggregate({ _count: true, _sum: { size: true } }),
    prisma.feedbackImage.aggregate({ where: purgeWhere(q), _count: true, _sum: { size: true } }),
  ]);
  return {
    total: { count: all._count, bytes: all._sum.size ?? 0 },
    purgeable: { count: purgeable._count, bytes: purgeable._sum.size ?? 0 },
  };
}

/** Deletes the pictures only. The feedback text, status and notes stay. */
export async function purgeImages(q: PurgeQuery) {
  const where = purgeWhere(q);
  const before = await prisma.feedbackImage.aggregate({ where, _sum: { size: true } });
  const res = await prisma.feedbackImage.deleteMany({ where });
  return { deleted: res.count, bytes: before._sum.size ?? 0 };
}

/** Deletes every picture of one feedback item, keeping the item. */
export async function removeImagesOf(feedbackId: string) {
  const exists = await prisma.feedback.findUnique({ where: { id: feedbackId }, select: { id: true } });
  if (!exists) throw notFound("Feedback not found");
  const res = await prisma.feedbackImage.deleteMany({ where: { feedbackId } });
  return { deleted: res.count };
}
