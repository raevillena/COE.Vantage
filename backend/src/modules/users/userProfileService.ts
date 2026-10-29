import { prisma } from "../../prisma/client.js";
import { notFound } from "../../utils/errors.js";

/** Everyone changes their own name; the email stays with the admin. */
export async function updateMyName(userId: string, name: string) {
  return prisma.user.update({ where: { id: userId }, data: { name }, select: { id: true, name: true } });
}

export async function setAvatar(userId: string, image: { mimeType: string; size: number; data: Buffer }) {
  const row = await prisma.userAvatar.upsert({
    where: { userId },
    create: { userId, ...image },
    update: image,
    select: { updatedAt: true },
  });
  return { avatarVersion: row.updatedAt.getTime() };
}

export async function removeAvatar(userId: string) {
  await prisma.userAvatar.deleteMany({ where: { userId } });
}

/**
 * The picture of a user the caller may see: themselves, or someone in their college (the college filter hides other
 * colleges' people; the admin and president see everyone).
 */
export async function getAvatar(callerId: string, userId: string) {
  if (callerId !== userId) {
    const visible = await prisma.user.findFirst({ where: { id: userId, isDeleted: false }, select: { id: true } });
    if (!visible) throw notFound("User not found");
  }
  const avatar = await prisma.userAvatar.findUnique({ where: { userId } });
  if (!avatar) throw notFound("No picture");
  return avatar;
}
