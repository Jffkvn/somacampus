// Phase A2: Pure tenant/objective guard for ai-teaching-assistant.
// No Deno or network imports — importable from vitest AND Deno Edge.
// All I/O goes through the injected GroundingStore (mocked in tests,
// Supabase service-role client in production).

export interface UserRoleRow {
  school_id: string;
  role_id: string;
}

export interface TenantIds {
  schoolId?: string | null;
  teacherId?: string | null;
  classId?: string | null;
  streamId?: string | null;
  subjectId?: string | null;
  studentId?: string | null;
  resourceIds?: string[];
}

export interface GroundingStore {
  getUserRoles(userId: string): Promise<UserRoleRow[]>;
  getClassSchool(classId: string): Promise<string | null>;
  getStreamSchool(streamId: string): Promise<string | null>;
  getSubjectSchool(subjectId: string): Promise<string | null>;
  getEmployeeSchool(employeeId: string): Promise<string | null>;
  /** auth.uid() → people → employees within schoolId (caller identity). */
  getEmployeeIdForAuthUser(userId: string, schoolId: string): Promise<string | null>;
  isStudentInSchool(studentId: string, schoolId: string): Promise<boolean>;
  getResourceSchool(resourceId: string): Promise<string | null>;
  objectiveExists(code: string): Promise<boolean>;
}

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() || null : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Collect tenant IDs from either top-level payload or nested lessonContext (back-compat). */
export function extractTenantIds(action: string, payload: Record<string, any>): TenantIds {
  const p = payload ?? {};
  const ctx = (p.lessonContext ?? {}) as Record<string, any>;
  const singleResource =
    asString(p.resourceId) ?? asString(p.resourceIdUsed) ?? asString(p.adaptedResourceId);
  const arr = Array.isArray(p.resourceIds)
    ? p.resourceIds.filter((r: unknown) => typeof r === "string" && (r as string).trim())
    : [];
  if (singleResource) arr.push(singleResource);

  void action;
  return {
    schoolId: asString(p.schoolId) ?? asString(ctx.schoolId) ?? asString(p.school_id),
    teacherId: asString(p.teacherId) ?? asString(ctx.teacherId) ?? asString(p.teacher_id),
    classId: asString(p.classId) ?? asString(ctx.classId) ?? asString(p.class_id),
    streamId: asString(p.streamId) ?? asString(ctx.streamId) ?? asString(p.stream_id),
    subjectId: asString(p.subjectId) ?? asString(ctx.subjectId) ?? asString(p.subject_id),
    studentId: asString(p.studentId) ?? asString(p.student_id),
    resourceIds: arr,
  };
}

/** Normalize objective code across actions (generate/extract use objectiveCode, suggest uses curriculumObjective). */
export function extractObjectiveCode(_action: string, payload: Record<string, any>): string | null {
  const p = payload ?? {};
  return (
    asString(p.objectiveCode) ??
    asString(p.curriculumObjective) ??
    asString(p.objective_code) ??
    null
  );
}

export interface AuthorizedTenant {
  schoolId: string;
  roleId: string;
  /** Caller's employee id in schoolId (auth.uid() → people → employees). */
  teacherId: string | null;
}

/**
 * Server-side grounding gate. Throws HttpError:
 *  403 when schoolId missing / no role / any supplied ID is cross-tenant /
 *      supplied teacherId is not the authenticated caller,
 *  400 when objective code missing or unknown (never invent).
 */
export async function authorizeAndValidate(
  store: GroundingStore,
  userId: string,
  action: string,
  payload: Record<string, any>
): Promise<AuthorizedTenant> {
  const ids = extractTenantIds(action, payload);

  if (!ids.schoolId) {
    throw new HttpError(403, "TENANT_MISSING", "schoolId is required for tenant grounding.");
  }
  const schoolId = ids.schoolId;

  const roles = await store.getUserRoles(userId);
  const match = roles.find((r) => r.school_id === schoolId);
  if (!match) {
    throw new HttpError(
      403,
      "TENANT_FORBIDDEN",
      "Caller has no role for the requested school."
    );
  }

  // Identity binding: client-supplied teacherId must be THIS caller's employee
  // row in the school — same-school membership alone is not enough (Teacher A
  // cannot act as Teacher B). Prefer the server-resolved employee id.
  const callerEmployeeId = await store.getEmployeeIdForAuthUser(userId, schoolId);
  if (ids.teacherId) {
    if (!callerEmployeeId || ids.teacherId !== callerEmployeeId) {
      throw new HttpError(
        403,
        "TEACHER_ID_MISMATCH",
        "teacherId must be the authenticated caller's employee id for this school."
      );
    }
    const s = await store.getEmployeeSchool(ids.teacherId);
    if (!s || s !== schoolId) {
      throw new HttpError(403, "TENANT_MISMATCH", `teacherId ${ids.teacherId} is not in caller's school.`);
    }
  }

  if (ids.classId) {
    const s = await store.getClassSchool(ids.classId);
    if (!s || s !== schoolId) {
      throw new HttpError(403, "TENANT_MISMATCH", `classId ${ids.classId} is not in caller's school.`);
    }
  }

  if (ids.streamId) {
    const s = await store.getStreamSchool(ids.streamId);
    if (!s || s !== schoolId) {
      throw new HttpError(403, "TENANT_MISMATCH", `streamId ${ids.streamId} is not in caller's school.`);
    }
  }

  if (ids.subjectId) {
    const s = await store.getSubjectSchool(ids.subjectId);
    if (!s || s !== schoolId) {
      throw new HttpError(403, "TENANT_MISMATCH", `subjectId ${ids.subjectId} is not in caller's school.`);
    }
  }

  if (ids.studentId) {
    const ok = await store.isStudentInSchool(ids.studentId, schoolId);
    if (!ok) {
      throw new HttpError(
        403,
        "TENANT_MISMATCH",
        `studentId ${ids.studentId} is not enrolled in caller's school.`
      );
    }
  }

  for (const rid of ids.resourceIds ?? []) {
    const s = await store.getResourceSchool(rid);
    if (!s || s !== schoolId) {
      throw new HttpError(403, "TENANT_MISMATCH", `resourceId ${rid} is not in caller's school.`);
    }
  }

  const code = extractObjectiveCode(action, payload);
  if (!code) {
    throw new HttpError(400, "MISSING_OBJECTIVE", "objectiveCode/curriculumObjective is required.");
  }
  const known = await store.objectiveExists(code);
  if (!known) {
    throw new HttpError(400, "UNKNOWN_OBJECTIVE", `Unknown curriculum objective code: "${code}".`);
  }

  return { schoolId, roleId: match.role_id, teacherId: callerEmployeeId };
}
