/** Payload when dragging a subject from the left pane. */
export interface SubjectDragItem {
  type: "subject";
  subjectId: string;
  code: string;
  name: string;
  isLab: boolean;
}
