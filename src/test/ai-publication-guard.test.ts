import { describe, it, expect } from 'vitest';
import { validateAssignmentPayload, type CreateAssignmentPayload } from '../modules/teaching/assignmentDomain';

describe('AI Assignment Publication Guard', () => {
  const basePayload: CreateAssignmentPayload = {
    schoolId: '22222222-2222-2222-2222-222222222222',
    teacherId: '99999999-9999-9999-9999-999999999992',
    classId: '55555555-5555-5555-5555-555555555551',
    subjectId: '77777777-7777-7777-7777-777777777771',
    title: 'Stage 5 Mathematics: Fractions Practice',
    instructions: 'Complete questions 1-8 on equivalent fractions.',
    assignedDate: '2026-09-19',
    dueDate: '2026-09-26',
    submissionType: 'homework',
    evidenceTrack: 'diagnostic_evidence',
  };

  it('allows publication of manual non-AI assignments directly', () => {
    const res = validateAssignmentPayload({
      ...basePayload,
      status: 'published',
      isAiDrafted: false,
    });
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects direct publication of AI drafts with approval_state = unreviewed', () => {
    const res = validateAssignmentPayload({
      ...basePayload,
      status: 'published',
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvalState: 'unreviewed',
    });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('AI-drafted assignments cannot be published without verified human approval');
  });

  it('rejects direct publication of AI drafts marked approved but missing teacher ID', () => {
    const res = validateAssignmentPayload({
      ...basePayload,
      status: 'published',
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvalState: 'approved',
      aiDraftApprovedBy: null,
    });
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('AI-drafted assignments cannot be published without verified human approval');
  });

  it('allows saving an unapproved AI draft with status = draft', () => {
    const res = validateAssignmentPayload({
      ...basePayload,
      status: 'draft',
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvalState: 'unreviewed',
    });
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('allows publication of AI drafts when human teacher explicitly approves with timestamp and teacher ID', () => {
    const res = validateAssignmentPayload({
      ...basePayload,
      status: 'published',
      isAiDrafted: true,
      requiresHumanApproval: true,
      approvalState: 'approved',
      aiDraftApprovedBy: '99999999-9999-9999-9999-999999999992',
      aiDraftApprovedAt: '2026-09-19T10:00:00Z',
    });
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });
});
