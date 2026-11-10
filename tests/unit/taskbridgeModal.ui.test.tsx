// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskBridgeFeedbackModal, TaskBridgeFeedbackFAB } from '../../src/components/taskbridge/TaskBridgeFeedbackModal';
import * as taskbridgeService from '../../src/lib/taskbridge';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TaskBridgeFeedbackModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <TaskBridgeFeedbackModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with Community Board and Give Feedback tabs, without title, email, or severity inputs', async () => {
    vi.spyOn(taskbridgeService, 'getProjectCommunityBoard').mockResolvedValue([
      {
        id: 'task_1',
        task_number: 101,
        title: 'Bluetooth printer disconnects during large receipts',
        description: 'Printer drops connection when printing more than 10 items.',
        type: 'BUG',
        status: 'IN_PROGRESS',
        upvotes: 7,
      },
    ]);

    render(<TaskBridgeFeedbackModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Feedback & Support')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Community Board/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Give Feedback/ })).toBeTruthy();

    // On default Give Feedback tab, verify only Type and clean textarea exist
    expect(screen.getByText('Issue / Defect')).toBeTruthy();
    expect(screen.getByText('Feature Request')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Explain what went wrong or how to reproduce it/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Submit Feedback/ })).toBeTruthy();

    // Verify simplicity: No title input, no email input, no severity dropdown!
    expect(screen.queryByPlaceholderText(/Printer disconnected/)).toBeNull();
    expect(screen.queryByPlaceholderText(/optional/)).toBeNull();
    expect(screen.queryByText(/Severity/)).toBeNull();

    // Now switch to Community Board tab
    fireEvent.click(screen.getByRole('button', { name: /Community Board/ }));

    // Check community board item loaded
    await waitFor(() => {
      expect(screen.getByText('Bluetooth printer disconnects during large receipts')).toBeTruthy();
      expect(screen.getByText('7')).toBeTruthy();
    });
  });

  it('allows upvoting community board items in real-time', async () => {
    vi.spyOn(taskbridgeService, 'getProjectCommunityBoard').mockResolvedValue([
      {
        id: 'task_99',
        task_number: 99,
        title: 'Arabic invoice template customization',
        description: 'Need bold headers on printed receipts.',
        type: 'FEATURE',
        status: 'RECEIVED',
        upvotes: 4,
      },
    ]);

    const upvoteSpy = vi.spyOn(taskbridgeService, 'upvoteTaskBridgeTask').mockResolvedValue(5);

    render(<TaskBridgeFeedbackModal isOpen={true} onClose={vi.fn()} defaultTab="BOARD" />);

    await waitFor(() => {
      expect(screen.getByText('Arabic invoice template customization')).toBeTruthy();
      expect(screen.getByText('4')).toBeTruthy();
    });

    const voteBtn = screen.getByTitle('Vote to prioritize this item');
    fireEvent.click(voteBtn);

    await waitFor(() => {
      expect(upvoteSpy).toHaveBeenCalledWith('task_99');
      expect(screen.getByText('5')).toBeTruthy();
    });
  });

  it('submits simple feedback with auto-derived title, switches to board, and avoids external redirects', async () => {
    vi.spyOn(taskbridgeService, 'getProjectCommunityBoard').mockResolvedValue([]);
    const submitSpy = vi.spyOn(taskbridgeService, 'submitToTaskBridge').mockResolvedValue({
      success: true,
      trackingToken: 'TB-TOKEN-7766',
      taskNumber: 120,
      ticketCode: '#120',
      customerStatus: 'RECEIVED',
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<TaskBridgeFeedbackModal isOpen={true} onClose={vi.fn()} defaultTab="NEW" />);

    const descInput = screen.getByPlaceholderText(/Explain what went wrong or how to reproduce it/);
    fireEvent.change(descInput, {
      target: { value: 'Barcode scanner takes 3 seconds to register code on dark surfaces.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit Feedback/ }));

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Barcode scanner takes 3 seconds to register code on dark surfaces.',
          description: 'Barcode scanner takes 3 seconds to register code on dark surfaces.',
          type: 'BUG',
        })
      );
    });

    // Zero external redirects!
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('displays error message if submission fails without closing modal', async () => {
    vi.spyOn(taskbridgeService, 'getProjectCommunityBoard').mockResolvedValue([]);
    vi.spyOn(taskbridgeService, 'submitToTaskBridge').mockRejectedValue(
      new Error('Network error connecting to TaskBridge')
    );

    render(<TaskBridgeFeedbackModal isOpen={true} onClose={vi.fn()} defaultTab="NEW" />);

    const descInput = screen.getByPlaceholderText(/Explain what went wrong or how to reproduce it/);
    fireEvent.change(descInput, { target: { value: 'Sample defect details' } });

    fireEvent.click(screen.getByRole('button', { name: /Submit Feedback/ }));

    await waitFor(() => {
      expect(screen.getByText('Network error connecting to TaskBridge')).toBeTruthy();
    });
  });

  it('renders FAB and opens modal when clicked', () => {
    const listener = vi.fn();
    window.addEventListener('open-taskbridge-feedback', listener);

    render(<TaskBridgeFeedbackFAB />);
    const fab = screen.getByRole('button', { name: /Feedback & Support/ });
    expect(fab).toBeTruthy();
    expect(fab.className).toContain('bg-card');

    fireEvent.click(fab);
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('open-taskbridge-feedback', listener);
  });
});
