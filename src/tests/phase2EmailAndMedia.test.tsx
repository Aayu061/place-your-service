import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// @ts-expect-error global React 19 test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockShowToast = vi.fn();
vi.mock('@/components/ui/useToast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockListDeliveries = vi.fn();
const mockRetryDelivery = vi.fn();
const mockGetAdminStatus = vi.fn();
const mockListInboundEmails = vi.fn();
const mockSendTestEmail = vi.fn();

vi.mock('@/services/emailApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/emailApi')>('@/services/emailApi');
  return {
    ...actual,
    emailApi: {
      ...actual.emailApi,
      listDeliveries: (...args: unknown[]) => mockListDeliveries(...args),
      retryDelivery: (...args: unknown[]) => mockRetryDelivery(...args),
      getAdminStatus: (...args: unknown[]) => mockGetAdminStatus(...args),
      listInboundEmails: (...args: unknown[]) => mockListInboundEmails(...args),
      sendTestEmail: (...args: unknown[]) => mockSendTestEmail(...args),
    },
  };
});

import { buildWhatsAppShareUrl } from '@/services/emailApi';
import { EmailDeliveryHistoryPanel } from '@/components/email/EmailDeliveryHistoryPanel';
import { ResendDiagnosticsPanel } from '@/components/email/ResendDiagnosticsPanel';

describe('Phase 2 Frontend Email, WhatsApp Share & Diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes 10-digit Indian phone numbers and encodes WhatsApp share text', () => {
    const url = buildWhatsAppShareUrl('9876543210', 'Invoice #INV-123');
    expect(url).toBe('https://wa.me/919876543210?text=Invoice%20%23INV-123');

    const intlUrl = buildWhatsAppShareUrl('+91 98765-43210', 'Hi');
    expect(intlUrl).toBe('https://wa.me/919876543210?text=Hi');

    const emptyPhoneUrl = buildWhatsAppShareUrl(null, 'Hello');
    expect(emptyPhoneUrl).toBe('https://wa.me/?text=Hello');
  });

  it('renders EmailDeliveryHistoryPanel deliveries and retries failed deliveries', async () => {
    mockListDeliveries.mockResolvedValue({
      deliveries: [
        {
          id: 'del-1',
          entity_type: 'PAYMENT_INVOICE',
          entity_id: 'pay-1',
          template_key: 'payment_invoice',
          recipient_email: 'client@example.com',
          recipient_name: 'Acme Corp',
          reply_to: 'extremess0121@gmail.com',
          subject: 'Invoice INV-001',
          status: 'FAILED',
          retryable: true,
          attempt_count: 1,
          max_attempts: 4,
          next_attempt_at: '2026-11-12T10:00:00Z',
          last_error: 'Temporary upstream timeout',
          transport: 'RESEND_API',
          provider_message_id: null,
          sent_at: null,
          delivered_at: null,
          bounced_at: null,
          created_at: '2026-11-12T09:50:00Z',
        },
      ],
      config: {
        configured: true,
        fromEmail: 'onboarding@resend.dev',
        replyTo: 'extremess0121@gmail.com',
        sandboxMode: true,
        sandboxOverrideTo: 'extremess0121@gmail.com',
        webhookConfigured: false,
        inboundDomain: null,
        automation: {
          autoSendReportOnVerify: false,
          autoSendAmcReminders: false,
          autoSendReceiptOnPaid: true,
        },
      },
    });
    mockRetryDelivery.mockResolvedValue({ processed: 1, delivery: null });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EmailDeliveryHistoryPanel entityType="PAYMENT_INVOICE" entityId="pay-1" />);
    });

    expect(container.textContent).toContain('client@example.com');
    expect(container.textContent).toContain('Failed');
    expect(container.textContent).toContain('Temporary upstream timeout');

    const retryButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry')
    );
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton!.click();
    });

    expect(mockRetryDelivery).toHaveBeenCalledWith('del-1');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders ResendDiagnosticsPanel config, inbound messages, and sends a diagnostic email', async () => {
    mockGetAdminStatus.mockResolvedValue({
      config: {
        configured: true,
        fromEmail: 'onboarding@resend.dev',
        replyTo: 'extremess0121@gmail.com',
        sandboxMode: true,
        sandboxOverrideTo: 'extremess0121@gmail.com',
        webhookConfigured: true,
        inboundDomain: null,
        automation: {
          autoSendReportOnVerify: false,
          autoSendAmcReminders: false,
          autoSendReceiptOnPaid: false,
        },
      },
      recentDeliveries: [],
    });
    mockListInboundEmails.mockResolvedValue({
      emails: [
        {
          id: 'in-1',
          resend_email_id: 're_in_1',
          from_email: 'customer@example.com',
          to_emails: ['reply@pys.in'],
          subject: 'Need urgent chiller inspection',
          text_body: 'Please send team tomorrow',
          html_body: null,
          customer_id: null,
          status: 'UNREAD',
          received_at: '2026-11-12T10:00:00Z',
        },
      ],
    });
    mockSendTestEmail.mockResolvedValue({
      delivery: { id: 'del-test', provider_message_id: 're_msg_1' },
      sandboxRedirected: true,
      effectiveRecipient: 'extremess0121@gmail.com',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ResendDiagnosticsPanel />);
    });

    expect(container.textContent).toContain('onboarding@resend.dev');
    expect(container.textContent).toContain('extremess0121@gmail.com');
    expect(container.textContent).toContain('Need urgent chiller inspection');

    const input = container.querySelector('input') as HTMLInputElement | null;
    const form = container.querySelector('form') as HTMLFormElement | null;
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'ops@example.com');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockSendTestEmail).toHaveBeenCalledWith('ops@example.com');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
