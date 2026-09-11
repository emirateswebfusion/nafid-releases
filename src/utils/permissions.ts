export interface UserPermissions {
  role?: string | null;
  permissions?: string[] | null;
}

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'sales',
    name: 'Sales & POS Billing',
    description: 'Billing, invoicing, discounts, and sales history',
    permissions: [
      { key: 'sales.view', label: 'View Sales History', description: 'Can view past sales and invoice list' },
      { key: 'sales.create', label: 'Create Bill / Invoice', description: 'Can issue new sales invoices' },
      { key: 'sales.edit', label: 'Edit Bill', description: 'Can edit active or existing bills' },
      { key: 'sales.delete', label: 'Delete Bill', description: 'Can delete invoices' },
      { key: 'sales.cancel', label: 'Cancel Bill', description: 'Can cancel or void invoices' },
      { key: 'sales.discount', label: 'Apply Discount', description: 'Can apply flat or percentage discounts on bills' },
      { key: 'sales.refund', label: 'Issue Refund / Returns', description: 'Can process customer returns and refunds' },
      { key: 'sales.reprint', label: 'Reprint Receipts', description: 'Can reprint existing receipts' },
    ],
  },
  {
    id: 'products',
    name: 'Products & Inventory',
    description: 'Catalog management and stock control',
    permissions: [
      { key: 'products.view', label: 'View Catalog', description: 'Can view products and inventory items' },
      { key: 'products.create', label: 'Create Product', description: 'Can add new products to inventory' },
      { key: 'products.edit', label: 'Edit Product', description: 'Can edit product details and pricing' },
      { key: 'products.delete', label: 'Delete Product', description: 'Can remove products from inventory' },
      { key: 'products.stock_adjust', label: 'Adjust Stock', description: 'Can perform stock level adjustments' },
    ],
  },
  {
    id: 'customers',
    name: 'Customers & Parties',
    description: 'Customer profiles and party ledgers',
    permissions: [
      { key: 'customers.view', label: 'View Customers', description: 'Can view customer directory and balances' },
      { key: 'customers.create', label: 'Create Customer', description: 'Can add new customers or suppliers' },
      { key: 'customers.edit', label: 'Edit Customer', description: 'Can update customer contact and address details' },
      { key: 'customers.delete', label: 'Delete Customer', description: 'Can delete customer accounts' },
      { key: 'customers.ledger', label: 'View Ledger', description: 'Can view party ledger transactions' },
    ],
  },
  {
    id: 'purchases',
    name: 'Purchase Bills & Expenses',
    description: 'Supplier purchases and business expenses',
    permissions: [
      { key: 'purchases.view', label: 'View Purchases', description: 'Can view purchase bills and expenses' },
      { key: 'purchases.create', label: 'Create Purchase Bill', description: 'Can enter new purchase bills' },
      { key: 'purchases.edit', label: 'Edit Purchase Bill', description: 'Can update purchase bill entries' },
      { key: 'purchases.delete', label: 'Delete Purchase Bill', description: 'Can remove purchase bills' },
    ],
  },
  {
    id: 'cash_register',
    name: 'Cash Register & Settlement',
    description: 'Till control, cash in/out, and register settlement',
    permissions: [
      { key: 'cash_register.view', label: 'View Cash Register', description: 'Can view register status and till amounts' },
      { key: 'cash_register.cash_in', label: 'Cash In', description: 'Can perform Cash In deposits' },
      { key: 'cash_register.cash_out', label: 'Cash Out', description: 'Can perform Cash Out withdrawals' },
      { key: 'cash_register.settlement', label: 'Cash Settlement', description: 'Can run cash settlement reconciliation' },
      { key: 'cash_register.close', label: 'Close Register', description: 'Can close register shift' },
    ],
  },
  {
    id: 'quotations',
    name: 'Quotations & Estimates',
    description: 'Sales estimates and quotations',
    permissions: [
      { key: 'quotations.view', label: 'View Quotations', description: 'Can view created estimates and quotes' },
      { key: 'quotations.create', label: 'Create Quotation', description: 'Can create new quotations' },
      { key: 'quotations.edit', label: 'Edit Quotation', description: 'Can modify existing quotations' },
      { key: 'quotations.delete', label: 'Delete Quotation', description: 'Can delete quotations' },
    ],
  },
  {
    id: 'scrap',
    name: 'Scrap Management',
    description: 'Scrap purchasing and deductions',
    permissions: [
      { key: 'scrap.view', label: 'View Scrap', description: 'Can view scrap records' },
      { key: 'scrap.create', label: 'Create Scrap', description: 'Can record new scrap entries' },
      { key: 'scrap.edit', label: 'Edit Scrap', description: 'Can update scrap entries' },
      { key: 'scrap.delete', label: 'Delete Scrap', description: 'Can remove scrap records' },
    ],
  },
  {
    id: 'warranties',
    name: 'Warranty Management',
    description: 'Product warranty cards and claims',
    permissions: [
      { key: 'warranties.view', label: 'View Warranties', description: 'Can view warranty records' },
      { key: 'warranties.create', label: 'Create Warranty', description: 'Can register new product warranties' },
      { key: 'warranties.edit', label: 'Edit Warranty', description: 'Can update warranty details' },
      { key: 'warranties.delete', label: 'Delete Warranty', description: 'Can delete warranty records' },
    ],
  },
  {
    id: 'combos',
    name: 'Combos & Pricing Tiers',
    description: 'Bundle offers and wholesale pricing tiers',
    permissions: [
      { key: 'combos.view', label: 'View Combos / Tiers', description: 'Can view combo offers and pricing tiers' },
      { key: 'combos.manage', label: 'Manage Combos / Tiers', description: 'Can create and edit combo offers and pricing rules' },
    ],
  },
  {
    id: 'reports',
    name: 'Reports & Financial Analytics',
    description: 'Business intelligence and financial reports',
    permissions: [
      { key: 'reports.view', label: 'View Stock & Sales Reports', description: 'Can view inventory and sales reports' },
      { key: 'reports.financial', label: 'View Financial Analytics', description: 'Can view revenue, profit & loss, and balances' },
      { key: 'reports.export', label: 'Export Report Data', description: 'Can export report tables to Excel/CSV' },
    ],
  },
  {
    id: 'settings',
    name: 'System Settings',
    description: 'Printer setups, invoice rules, and business details',
    permissions: [
      { key: 'settings.view', label: 'View Settings', description: 'Can access system preferences' },
      { key: 'settings.edit', label: 'Edit General Settings', description: 'Can modify thermal printer & hardware settings' },
      { key: 'settings.business', label: 'Edit Business Settings', description: 'Can modify shop name, logo, GSTIN, invoice sequence counters' },
    ],
  },
  {
    id: 'users',
    name: 'User & Permission Management',
    description: 'Staff account administration',
    permissions: [
      { key: 'users.view', label: 'View Users', description: 'Can view list of staff members' },
      { key: 'users.create', label: 'Create Staff', description: 'Can create new staff accounts' },
      { key: 'users.edit', label: 'Edit Staff', description: 'Can update staff details and credentials' },
      { key: 'users.delete', label: 'Delete Staff', description: 'Can remove staff accounts' },
      { key: 'users.permissions', label: 'Manage Staff Permissions', description: 'Can assign and modify permissions for staff accounts' },
    ],
  },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));

/**
 * Legacy string mapper to convert old restricted_page comma-separated strings into positive permission arrays
 */
export function convertLegacyRestrictedPageToPermissions(restrictedPage?: string | null): string[] {
  if (!restrictedPage || restrictedPage.trim() === '') {
    return ALL_PERMISSION_KEYS; // No restrictions -> full permissions
  }

  const restrictedList = restrictedPage.split(',').map(s => s.trim().toUpperCase());
  const allowedPermissions: string[] = [];

  const mapModuleToPerms: Record<string, string[]> = {
    'DASHBOARD': ['dashboard.view'],
    'BILLING': ['sales.view', 'sales.create', 'sales.edit', 'sales.discount', 'sales.refund', 'sales.reprint', 'bills.view', 'bills.create', 'bills.edit'],
    'INVENTORY': ['products.view', 'products.create', 'products.edit', 'products.stock_adjust'],
    'CUSTOMERS': ['customers.view', 'customers.create', 'customers.edit', 'customers.ledger'],
    'PURCHASES': ['purchases.view', 'purchases.create', 'purchases.edit'],
    'CASH_REGISTER': ['cash_register.view', 'cash_register.cash_in', 'cash_register.cash_out', 'cash_register.settlement'],
    'QUOTATIONS': ['quotations.view', 'quotations.create', 'quotations.edit'],
    'SCRAP': ['scrap.view', 'scrap.create', 'scrap.edit'],
    'WARRANTY': ['warranties.view', 'warranties.create', 'warranties.edit'],
    'REPORTS': ['reports.view', 'reports.financial', 'reports.export'],
    'SETTINGS': ['settings.view', 'settings.edit'],
    'STAFF': ['users.view'],
  };

  Object.entries(mapModuleToPerms).forEach(([modKey, perms]) => {
    if (!restrictedList.includes(modKey)) {
      allowedPermissions.push(...perms);
    }
  });

  return allowedPermissions;
}

/**
 * Checks if a user has a specific permission.
 * Dashboard access is compulsory for all users.
 * Admin / Owner automatically bypasses all permission checks.
 */
export function hasPermission(user: UserPermissions | null | undefined, permissionKey: string): boolean {
  if (!user) return false;
  if (permissionKey === 'dashboard.view' || permissionKey === 'dashboard') return true;

  const role = (user.role || '').toUpperCase();
  if (role === 'OWNER' || role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return true;
  }
  if (role === 'STAFF' || role === 'BILLER' || role === 'CASHIER') {
    const userPerms = user.permissions || [];
    if (userPerms.includes('*')) return true;
    return userPerms.includes(permissionKey);
  }
  return false;
}
