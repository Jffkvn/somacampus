import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from '../components/ui/Toast';
import { SlideToConfirm } from '../components/ui/SlideToConfirm';

describe('Toast (P1)', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast.success('Payment recorded', 'Receipt RCP-1')}>
        fire
      </button>
    );
  }

  it('renders success toast and can dismiss', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    expect(await screen.findByText('Payment recorded')).toBeInTheDocument();
    expect(screen.getByText('Receipt RCP-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i }));
    await waitFor(() => expect(screen.queryByText('Payment recorded')).not.toBeInTheDocument());
  });
});

describe('SlideToConfirm (P1)', () => {
  it('calls onConfirm after hold completes', async () => {
    const onConfirm = vi.fn();
    // jsdom: force reduced-motion so confirm fires on pointerDown (no rAF dependency)
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<SlideToConfirm label="Finalize & Lock Run" onConfirm={onConfirm} holdMs={50} />);
    const btn = screen.getByRole('button', { name: /finalize/i });
    fireEvent.pointerDown(btn);
    await waitFor(() => expect(onConfirm).toHaveBeenCalled(), { timeout: 500 });
  });
});
