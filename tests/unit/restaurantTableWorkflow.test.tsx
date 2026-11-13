// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRestaurantDraftStore } from '../../src/store/restaurantDraftStore';
import { OrderPanel } from '../../src/components/restaurant/views/OrderPanel';
import { FloorView } from '../../src/components/restaurant/views/FloorView';
import type { ActiveOrders, DiningTable, OrderLine, RestaurantOrder } from '../../src/data/restaurant';
import type { RestaurantData } from '../../src/components/restaurant/hooks/useRestaurantData';
import type { OrderActions } from '../../src/components/restaurant/hooks/useOrderActions';
import { DEFAULT_SERVICE_CHARGE } from '../../src/components/restaurant/restaurantRules';

afterEach(() => {
  cleanup();
});

describe('useRestaurantDraftStore billed status', () => {
  beforeEach(() => {
    useRestaurantDraftStore.setState({ drafts: {}, billedOrderIds: {} });
  });

  it('marks an order as billed and clears it', () => {
    const store = useRestaurantDraftStore.getState();
    expect(store.billedOrderIds['order-1']).toBeUndefined();

    store.markBilled('order-1');
    expect(useRestaurantDraftStore.getState().billedOrderIds['order-1']).toBe(true);

    store.clearBilled('order-1');
    expect(useRestaurantDraftStore.getState().billedOrderIds['order-1']).toBeUndefined();
  });
});

describe('OrderPanel bill issuance vs payment separation', () => {
  const mockOrder: RestaurantOrder = {
    order_id: 'ord-100',
    tenant_id: 't1',
    order_no: '100',
    order_type: 'DINE_IN',
    table_id: 'tbl-1',
    covers: 2,
    waiter_user_id: 'w1',
    waiter_name: 'John',
    customer_name: null,
    customer_phone: null,
    delivery_address: null,
    channel: 'OWN',
    channel_ref: null,
    delivery_fee: 0,
    status: 'OPEN',
    billing_terminal: null,
    billing_since: null,
    invoice_id: null,
    invoice_number: null,
    parent_order_id: null,
    note: null,
    opened_by: 'u1',
    opened_at: new Date().toISOString(),
    business_date: '2026-11-13',
    closed_at: null,
    sync_status: 'PENDING',
    created_at: '',
    updated_at: '',
  };

  const mockLines: OrderLine[] = [
    {
      line_id: 'l1',
      tenant_id: 't1',
      order_id: 'ord-100',
      product_id: 'p1',
      name: 'Biryani',
      category: 'Food',
      quantity: 1,
      unit_price: 250,
      tax_rate: 5,
      modifiers: '[]',
      note: null,
      seat: null,
      station_id: 's1',
      kot_id: 'k1',
      status: 'ACTIVE',
      void_reason: null,
      voided_by: null,
      voided_at: null,
      void_kot_id: null,
      moved_from_line_id: null,
      created_by: 'u1',
      created_at: '',
    },
  ];

  const mockTable: DiningTable = {
    table_id: 'tbl-1',
    tenant_id: 't1',
    label: 'T1',
    area: 'Main',
    seats: 4,
    sort_order: 1,
    is_active: true,
  };

  const mockData: RestaurantData = {
    setup: {
      tables: [mockTable],
      stations: [],
      modifierGroups: [],
      modifiers: [],
    },
    active: {
      orders: [mockOrder],
      lines: mockLines,
      kots: [],
      closedToday: [],
      terminal: 'TERM-1',
    },
    products: [],
    staff: [],
    serviceCharge: DEFAULT_SERVICE_CHARGE,
    loading: false,
    error: null,
    setError: () => {},
    refreshOrders: async () => {},
    refreshSetup: async () => {},
  };

  it('shows distinct "Print bill / check" and "Proceed to payment" buttons instead of one combined button', async () => {
    const user = userEvent.setup();
    const printGuestCheckMock = vi.fn().mockResolvedValue(true);
    const billOrderMock = vi.fn().mockResolvedValue(true);
    const onMarkBilledMock = vi.fn();

    const actions = {
      printGuestCheck: printGuestCheckMock,
      billOrder: billOrderMock,
      sendItems: vi.fn(),
      reprint: vi.fn(),
      working: false,
    } as unknown as OrderActions;

    render(
      <OrderPanel
        order={mockOrder}
        data={mockData}
        actions={actions}
        can={() => true}
        onBack={() => {}}
        onSelectOrder={() => {}}
        drafts={[]}
        setDrafts={() => {}}
        isBilled={false}
        onMarkBilled={onMarkBilledMock}
      />
    );

    // Old combined button "Bill & take payment" should NOT exist
    expect(screen.queryByText(/Bill & take payment/i)).toBeNull();

    // The two distinct buttons MUST be present
    const printBtn = screen.getByRole('button', { name: /Print bill \/ check/i });
    const payBtn = screen.getByRole('button', { name: /Proceed to payment/i });
    expect(printBtn).toBeDefined();
    expect(payBtn).toBeDefined();

    // Clicking Print bill calls printGuestCheck and marks billed
    await user.click(printBtn);
    expect(printGuestCheckMock).toHaveBeenCalledTimes(1);
    expect(onMarkBilledMock).toHaveBeenCalledWith('ord-100');

    // Clicking Proceed to payment calls billOrder
    await user.click(payBtn);
    expect(billOrderMock).toHaveBeenCalledTimes(1);
  });

  it('displays "Bill issued (pro-forma check)" banner and "Reprint bill" when order is billed', () => {
    const actions = {
      printGuestCheck: vi.fn(),
      billOrder: vi.fn(),
      sendItems: vi.fn(),
      reprint: vi.fn(),
      working: false,
    } as unknown as OrderActions;

    render(
      <OrderPanel
        order={mockOrder}
        data={mockData}
        actions={actions}
        can={() => true}
        onBack={() => {}}
        onSelectOrder={() => {}}
        drafts={[]}
        setDrafts={() => {}}
        isBilled={true}
      />
    );

    expect(screen.getByText(/Bill issued \(pro-forma check\)/i)).toBeDefined();
    expect(screen.getByText(/Awaiting payment/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Reprint bill/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Proceed to payment/i })).toBeDefined();
  });

  it('prioritizes "Send to kitchen" when there are unsent drafts', () => {
    const actions = {
      printGuestCheck: vi.fn(),
      billOrder: vi.fn(),
      sendItems: vi.fn(),
      reprint: vi.fn(),
      working: false,
    } as unknown as OrderActions;

    render(
      <OrderPanel
        order={mockOrder}
        data={mockData}
        actions={actions}
        can={() => true}
        onBack={() => {}}
        onSelectOrder={() => {}}
        drafts={[
          {
            key: 'd1',
            product_id: 'p2',
            name: 'Naan',
            category: 'Bread',
            quantity: 2,
            unit_price: 40,
            tax_rate: 5,
            modifiers: [],
            note: null,
            seat: null,
          },
        ]}
        setDrafts={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /Send to kitchen · 2 items/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Proceed to payment/i })).toBeNull();
  });
});

describe('FloorView with Billed state', () => {
  const table: DiningTable = {
    table_id: 't1',
    tenant_id: 't1',
    label: 'T1',
    area: 'Main',
    seats: 4,
    sort_order: 1,
    is_active: true,
  };

  const active: ActiveOrders = {
    orders: [
      {
        order_id: 'ord-1',
        tenant_id: 't1',
        order_no: '1',
        order_type: 'DINE_IN',
        table_id: 't1',
        covers: 2,
        waiter_user_id: null,
        waiter_name: 'Server',
        customer_name: null,
        customer_phone: null,
        delivery_address: null,
        channel: 'OWN',
        channel_ref: null,
        delivery_fee: 0,
        status: 'OPEN',
        billing_terminal: null,
        billing_since: null,
        invoice_id: null,
        invoice_number: null,
        parent_order_id: null,
        note: null,
        opened_by: 'u1',
        opened_at: new Date().toISOString(),
        business_date: '2026-11-13',
        closed_at: null,
        sync_status: 'PENDING',
        created_at: '',
        updated_at: '',
      },
    ],
    lines: [],
    kots: [],
    closedToday: [],
    terminal: 'TERM-1',
  };

  it('renders "Billed" badge on the table tile when bill is printed', () => {
    render(
      <FloorView
        tables={[table]}
        active={active}
        unsentOrderIds={[]}
        billedOrderIds={['ord-1']}
        onFreeTable={() => {}}
        onOpenOrder={() => {}}
        onSetup={() => {}}
      />
    );

    // Appears in legend and on table tile badge
    const billedBadges = screen.getAllByText('Billed');
    expect(billedBadges.length).toBeGreaterThanOrEqual(2);
  });
});
