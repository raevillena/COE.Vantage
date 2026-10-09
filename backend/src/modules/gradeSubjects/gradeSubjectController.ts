import type { Request, Response } from "express";
import * as service from "./gradeSubjectService.js";
import type {
  CreateGradeRecordBody,
  CreateGradeSubjectBody,
  ImportGradeRecordsBody,
  ImportFromGoogleSheetBody,
  PublicLookupQuery,
  PublicComputeRecordBody,
  SendAccessCodesBody,
  UpdateGradeRecordBody,
  UpdateGradeSubjectBody,
  UpsertViewerBody,
} from "./gradeSubjectSchemas.js";
import { badRequest } from "../../utils/errors.js";

function getCaller(req: Request) {
  if (!req.user) throw new Error("Missing authenticated user");
  return req.user;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.listGradeSubjects(getCaller(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateGradeSubjectBody;
  res.status(201).json(await service.createGradeSubject(getCaller(req), body));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getGradeSubjectById(req.params.id, getCaller(req)));
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateGradeSubjectBody;
  res.json(await service.updateGradeSubject(req.params.id, getCaller(req), body));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.deleteGradeSubject(req.params.id, getCaller(req));
  res.status(204).send();
}

export async function listSubjectViewers(req: Request, res: Response): Promise<void> {
  res.json(await service.listViewers(req.params.id, getCaller(req)));
}

export async function listViewerCandidates(req: Request, res: Response): Promise<void> {
  res.json(await service.listViewerCandidates(req.params.id, getCaller(req)));
}

export async function upsertSubjectViewer(req: Request, res: Response): Promise<void> {
  const body = req.body as UpsertViewerBody;
  await service.upsertViewer(req.params.id, getCaller(req), body);
  res.status(204).send();
}

export async function removeSubjectViewer(req: Request, res: Response): Promise<void> {
  await service.removeViewer(req.params.id, req.params.userId, getCaller(req));
  res.status(204).send();
}

export async function listSubjectRecords(req: Request, res: Response): Promise<void> {
  res.json(await service.listRecords(req.params.id, getCaller(req)));
}

export async function createSubjectRecord(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateGradeRecordBody;
  res.status(201).json(await service.createRecord(req.params.id, getCaller(req), body));
}

export async function importSubjectRecords(req: Request, res: Response): Promise<void> {
  const body = req.body as ImportGradeRecordsBody;
  res.status(201).json(await service.importRecords(req.params.id, getCaller(req), body));
}

export async function importSubjectFromGoogleSheet(req: Request, res: Response): Promise<void> {
  const body = req.body as ImportFromGoogleSheetBody;
  res.status(201).json(await service.importRecordsFromGoogleSheet(req.params.id, getCaller(req), body.sheetUrl));
}

export async function importSubjectExcel(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file?.buffer?.length) {
    throw badRequest("Upload an .xlsx file using the file field name \"file\".");
  }
  res.status(201).json(await service.importRecordsFromExcelBuffer(req.params.id, getCaller(req), file.buffer));
}

export async function importSubjectCsv(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file?.buffer?.length) {
    throw badRequest("Upload a CSV file using the file field name \"file\".");
  }
  const name = file.originalname?.toLowerCase() ?? "";
  const mime = file.mimetype?.toLowerCase() ?? "";
  const looksCsv =
    name.endsWith(".csv") ||
    mime.includes("csv") ||
    mime === "text/plain" ||
    mime.startsWith("text/") ||
    mime === "application/octet-stream" ||
    mime === "";
  if (!looksCsv) {
    throw badRequest("Expected a .csv file (some browsers send an unexpected MIME type; try renaming to .csv).");
  }
  res.status(201).json(await service.importRecordsFromCsvBuffer(req.params.id, getCaller(req), file.buffer));
}

export async function updateSubjectRecord(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateGradeRecordBody;
  res.json(await service.updateRecord(req.params.id, req.params.recordId, getCaller(req), body));
}

export async function deleteSubjectRecord(req: Request, res: Response): Promise<void> {
  await service.deleteRecord(req.params.id, req.params.recordId, getCaller(req));
  res.status(204).send();
}

export async function regenerateSubjectRecordAccessCode(req: Request, res: Response): Promise<void> {
  res.json(await service.regenerateRecordAccessCode(req.params.id, req.params.recordId, getCaller(req)));
}

export async function computeSubjectGrades(req: Request, res: Response): Promise<void> {
  res.json(await service.computeGrades(req.params.id, getCaller(req)));
}

export async function publicLookup(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as PublicLookupQuery;
  res.json(await service.publicLookup(query.studentNumber, query.code));
}

export async function sendSubjectAccessCodes(req: Request, res: Response): Promise<void> {
  const body = req.body as SendAccessCodesBody;
  res.json(await service.sendAccessCodes(req.params.id, getCaller(req), body));
}

export async function publicComputeRecord(req: Request, res: Response): Promise<void> {
  const body = req.body as PublicComputeRecordBody;
  res.json(await service.publicComputeRecord(req.params.recordId, body));
}

