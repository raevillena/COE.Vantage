/** Payload when dragging a subject from the left pane. */
export interface SubjectDragItem {
  type: "subject";
  subjectId: string;
  code: string;
  name: string;
  isLab: boolean;
}

import type { FacultyLoad } from "../../types/api";

/** Payload when dragging an existing load block to move it to another slot. */
export interface LoadDragItem {
  type: "load";
  load: FacultyLoad;
}
