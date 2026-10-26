-- Rooms a subject may use when auto-assign picks a room (no rows = any available room).
CREATE TABLE "SubjectRoom" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectRoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubjectRoom_subjectId_roomId_key" ON "SubjectRoom"("subjectId", "roomId");
CREATE INDEX "SubjectRoom_subjectId_idx" ON "SubjectRoom"("subjectId");
CREATE INDEX "SubjectRoom_roomId_idx" ON "SubjectRoom"("roomId");

ALTER TABLE "SubjectRoom" ADD CONSTRAINT "SubjectRoom_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectRoom" ADD CONSTRAINT "SubjectRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
