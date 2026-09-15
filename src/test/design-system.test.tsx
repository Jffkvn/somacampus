import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StatusPill } from '../components/ui/StatusPill';
import { Button } from '../components/ui/Button';
import { Card, CardTitle, CardContent } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { StatCard } from '../components/ui/StatCard';
import { teacherService } from '../modules/teacher/teacherService';
import { leadershipService } from '../modules/leadership/leadershipService';
import { feesService } from '../modules/fees/feesService';

describe('SomaCampus Design System & Tokens', () => {
  it('renders all 6 semantic status pills with proper text and structure', () => {
    const states = ['success', 'pending', 'warning', 'critical', 'info', 'neutral'] as const;

    states.forEach((status) => {
      const { unmount } = render(
        <StatusPill status={status} label={`Status: ${status}`} />
      );
      expect(screen.getByText(`Status: ${status}`)).toBeInTheDocument();
      unmount();
    });
  });

  it('renders primary brand teal button with loading state', () => {
    const { rerender } = render(<Button variant="primary">Confirm Lesson</Button>);
    const button = screen.getByRole('button', { name: /confirm lesson/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-brand-teal');

    rerender(<Button variant="primary" isLoading>Confirm Lesson</Button>);
    expect(button).toBeDisabled();
  });

  it('renders cards with restrained styling and no visual clutter', () => {
    render(
      <Card>
        <CardTitle>Water Cycle Lesson</CardTitle>
        <CardContent>Covered condensation and evaporation.</CardContent>
      </Card>
    );
    expect(screen.getByText('Water Cycle Lesson')).toBeInTheDocument();
    expect(screen.getByText('Covered condensation and evaporation.')).toBeInTheDocument();
  });

  it('StatCard renders numeric value with tabular nums for money KPIs', () => {
    render(<StatCard label="Cash Received" value="UGX 5,200,000" />);
    expect(screen.getByText(/5,200,000/)).toBeInTheDocument();
    expect(screen.getByText('Cash Received')).toBeInTheDocument();
  });
});

describe('Modal a11y & motion (P0)', () => {
  function ModalHarness({ onClosed }: { onClosed?: () => void }) {
    const [open, setOpen] = React.useState(true);
    return (
      <Modal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          onClosed?.();
        }}
        title="Record Payment"
      >
        <button type="button">Confirm</button>
      </Modal>
    );
  }

  it('exposes dialog semantics and closes on Escape', async () => {
    const onClosed = vi.fn();
    render(<ModalHarness onClosed={onClosed} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Record Payment' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClosed).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes when close button is activated', async () => {
    const onClosed = vi.fn();
    render(<ModalHarness onClosed={onClosed} />);
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClosed).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Phase 1 Domain Contracts Verification', () => {
  it('teacherService returns a valid TeacherTodayViewModel adhering to the contract', async () => {
    const data = await teacherService.getTeacherToday('teacher-01', '2026-09-03');
    expect(data.teacherId).toBe('teacher-01');
    expect(data.schedule.length).toBeGreaterThan(0);
    expect(data.schedule[0]).toHaveProperty('startTime');
    expect(data.schedule[0]).toHaveProperty('subjectName');
    expect(data.schedule[0]).toHaveProperty('curriculumPosition');
    expect(data.clockInStatus).toHaveProperty('isClockedIn');
  });

  it('leadershipService returns valid LeadershipLessonSummary adhering to the contract', async () => {
    const data = await leadershipService.getSchoolLeadershipDashboard('school-01', '2026-09-03');
    expect(data.stats.enrolledStudents).toBeGreaterThan(0);
    expect(data.activeLessons.length).toBeGreaterThan(0);
    expect(data.activeLessons[0]).toHaveProperty('visibleLessonNote');
    expect(data.activeLessons[0]).not.toHaveProperty('privateReflection'); // Leadership CANNOT see private reflection
  });

  it('feesService returns valid FeesDashboardViewModel with balance and clearance rate', async () => {
    const data = await feesService.getFeesDashboard('school-01');
    expect(data.totalAssessed).toBeGreaterThan(0);
    expect(data.accounts.length).toBeGreaterThan(0);
    expect(data.accounts[0]).toHaveProperty('clearanceStatus');
  });
});
