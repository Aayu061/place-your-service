import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TablePagination } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';

describe('Phase 1 UI Components Suite', () => {
  it('Button renders variants, sizes, and loading state with aria-busy', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <div>
          <Button variant="primary" size="md">Click Me</Button>
          <Button variant="ghost" size="sm">Ghost</Button>
          <Button variant="danger" isLoading>Processing</Button>
          <Button variant="outline" disabled>Disabled</Button>
        </div>
      );
    });

    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(4);

    expect(buttons[0].className).toContain('btn-primary');
    expect(buttons[0].textContent).toBe('Click Me');

    expect(buttons[1].className).toContain('btn-ghost');
    expect(buttons[1].className).toContain('btn-sm');

    expect(buttons[2].className).toContain('btn-danger');
    expect(buttons[2].getAttribute('aria-busy')).toBe('true');
    expect(buttons[2].disabled).toBe(true);

    expect(buttons[3].disabled).toBe(true);
  });

  it('Badge renders appropriate semantic variants', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <div>
          <Badge variant="brand">Brand Badge</Badge>
          <Badge variant="success">Success Badge</Badge>
          <Badge variant="error">Error Badge</Badge>
        </div>
      );
    });

    const badges = container.querySelectorAll('.badge');
    expect(badges[0].className).toContain('badge-brand');
    expect(badges[1].className).toContain('badge-success');
    expect(badges[2].className).toContain('badge-error');
  });

  it('StatusBadge renders multi-cue status with dot and text', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <div>
          <StatusBadge status="IN_PROGRESS" />
          <StatusBadge status="COMPLETED" />
          <StatusBadge status="AWAITING_PARTS" />
        </div>
      );
    });

    const statusBadges = container.querySelectorAll('.badge');
    expect(statusBadges).toHaveLength(3);

    expect(statusBadges[0].textContent).toContain('In Progress');
    expect(statusBadges[0].className).toContain('badge-info');

    expect(statusBadges[1].textContent).toContain('Completed');
    expect(statusBadges[1].className).toContain('badge-success');

    expect(statusBadges[2].textContent).toContain('Awaiting Parts');
    expect(statusBadges[2].className).toContain('badge-amc');
  });

  it('Card renders header, title, body, and interactive classes', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <Card variant="interactive">
          <CardHeader>
            <CardTitle>Test Card Title</CardTitle>
          </CardHeader>
          <CardBody>Test card body text</CardBody>
        </Card>
      );
    });

    const card = container.querySelector('.card');
    expect(card?.className).toContain('card-interactive');
    expect(container.querySelector('.card-title')?.textContent).toBe('Test Card Title');
    expect(container.querySelector('.card-body')?.textContent).toBe('Test card body text');
  });

  it('Input renders label, required indicator, and error message', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <div>
          <Input label="Customer Name" required placeholder="Enter name" />
          <Input label="Email" error="Invalid email address format" />
        </div>
      );
    });

    const labels = container.querySelectorAll('label');
    expect(labels[0].textContent).toContain('Customer Name');
    expect(labels[0].textContent).toContain('*');

    const errorSpan = container.querySelector('.form-error');
    expect(errorSpan?.textContent).toBe('Invalid email address format');
    expect(errorSpan?.getAttribute('role')).toBe('alert');
  });

  it('Select and Textarea render form controls properly', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <div>
          <Select
            label="Service Area"
            options={[
              { value: 'NORTH', label: 'North Region' },
              { value: 'SOUTH', label: 'South Region' },
            ]}
          />
          <Textarea label="Notes" rows={4} defaultValue="Initial note" />
        </div>
      );
    });

    const select = container.querySelector('select');
    expect(select?.options).toHaveLength(2);
    expect(select?.options[0].textContent).toBe('North Region');

    const textarea = container.querySelector('textarea');
    expect(textarea?.rows).toBe(4);
    expect(textarea?.value).toBe('Initial note');
  });

  it('Tabs manages active tab state and displays appropriate panel', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sites">Sites</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview Panel Content</TabsContent>
          <TabsContent value="sites">Sites Panel Content</TabsContent>
        </Tabs>
      );
    });

    expect(container.querySelector('.tab-content')?.textContent).toBe('Overview Panel Content');

    const triggers = container.querySelectorAll('.tab-trigger');
    expect(triggers[0].getAttribute('data-active')).toBe('true');
    expect(triggers[1].getAttribute('data-active')).toBe('false');

    act(() => {
      (triggers[1] as HTMLButtonElement).click();
    });

    expect(container.querySelector('.tab-content')?.textContent).toBe('Sites Panel Content');
    expect(triggers[1].getAttribute('data-active')).toBe('true');
  });

  it('Table and TablePagination render tabular data and pagination buttons', () => {
    const onPageChange = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Customer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>SR-001</TableCell>
                <TableCell>Acme Corp</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <TablePagination
            currentPage={1}
            totalPages={3}
            onPageChange={onPageChange}
          />
        </div>
      );
    });

    const ths = container.querySelectorAll('th');
    expect(ths).toHaveLength(2);
    expect(ths[0].textContent).toBe('ID');

    const tds = container.querySelectorAll('td');
    expect(tds).toHaveLength(2);
    expect(tds[0].textContent).toBe('SR-001');

    const buttons = container.querySelectorAll('.table-pagination button');
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true); // Previous disabled on page 1

    act(() => {
      (buttons[1] as HTMLButtonElement).click(); // Click Next
    });

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('Modal renders dialog when isOpen is true and calls onClose', () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <p>Modal body content</p>
        </Modal>
      );
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(container.querySelector('.modal-title')?.textContent).toBe('Test Modal');

    // Click close button
    const closeBtn = container.querySelector('.modal-header button');
    act(() => {
      (closeBtn as HTMLButtonElement)?.click();
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('Drawer renders slide-over when isOpen is true', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <Drawer isOpen={true} onClose={() => {}} title="Test Drawer">
          <p>Drawer content</p>
        </Drawer>
      );
    });

    const drawer = container.querySelector('[role="dialog"]');
    expect(drawer).not.toBeNull();
    expect(container.querySelector('.drawer-title')?.textContent).toBe('Test Drawer');
  });

  it('Dropdown toggles menu on trigger click', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <Dropdown trigger={<button id="trigger-btn">Open Menu</button>}>
          <DropdownItem>Item 1</DropdownItem>
          <DropdownItem>Item 2</DropdownItem>
        </Dropdown>
      );
    });

    expect(container.querySelector('.dropdown-menu')).toBeNull();

    const triggerWrapper = container.querySelector('[role="button"]');
    act(() => {
      (triggerWrapper as HTMLElement)?.click();
    });

    expect(container.querySelector('.dropdown-menu')).not.toBeNull();
    const items = container.querySelectorAll('.dropdown-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('Item 1');
  });
});
