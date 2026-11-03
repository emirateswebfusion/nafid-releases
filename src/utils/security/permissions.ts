export interface UserPermissions {
  role?: string | null;
  permissions?: string[] | null;
  restrictedPage?: string | null;
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
    description: 'Billing, invoicing, GST vs. Estimate separation, discounts, and pricing controls',
    permissions: [
      { key: 'sales.view', label: 'View All Sales History', description: 'Can view both GST and Estimate sales history' },
      { key: 'sales.view_gst', label: 'View GST Sales Invoices', description: 'Can view GST tax invoices in sales history' },
      { key: 'sales.view_estimate', label: 'View Estimate / BoS Invoices', description: 'Can view Non-GST / Estimate / Bill of Supply invoices in sales history' },
      { key: 'sales.create', label: 'Create Any Bill / Invoice', description: 'Can issue both GST and Estimate invoices' },
      { key: 'sales.create_gst', label: 'Create GST Invoices', description: 'Can issue GST tax invoices during checkout' },
      { key: 'sales.create_estimate', label: 'Create Estimate / BoS Invoices', description: 'Can issue Non-GST / Estimate / Bill of Supply invoices' },
      { key: 'sales.edit_price', label: 'Override Unit Price', description: 'Can manually edit item unit price during checkout' },
      { key: 'sales.discount', label: 'Apply Discount', description: 'Can apply flat or percentage discounts on bills' },
      { key: 'sales.edit', label: 'Edit Bill', description: 'Can edit active or existing bills' },
      { key: 'sales.delete', label: 'Delete Bill', description: 'Can delete sales invoices' },
      { key: 'sales.cancel', label: 'Cancel Bill', description: 'Can cancel or void sales invoices' },
      { key: 'sales.refund', label: 'Issue Refund / Returns', description: 'Can process customer returns and refunds' },
      { key: 'sales.reprint', label: 'Reprint Receipts', description: 'Can reprint existing thermal receipts' },
    ],
  },
  {
    id: 'products',
    name: 'Products & Inventory',
    description: 'Catalog management, GST separation, purchase costs, and stock control',
    permissions: [
      { key: 'products.view', label: 'View All Products', description: 'Can view all items in inventory catalog' },
      { key: 'products.view_gst', label: 'View GST Products', description: 'Can view GST applicable products in catalog' },
      { key: 'products.view_estimate', label: 'View Estimate / Non-GST Products', description: 'Can view Non-GST / Estimate products in catalog' },
      { key: 'products.view_cost', label: 'View Purchase Cost & Margins', description: 'Can view product purchase costs and profit margins' },
      { key: 'products.create', label: 'Create Product', description: 'Can add new products to inventory' },
      { key: 'products.create_gst', label: 'Create GST Products', description: 'Can create products marked as GST applicable' },
      { key: 'products.create_estimate', label: 'Create Estimate / Non-GST Products', description: 'Can create products marked as Non-GST / Estimate' },
      { key: 'products.edit', label: 'Edit Product', description: 'Can edit product details and selling prices' },
      { key: 'products.delete', label: 'Delete Product', description: 'Can remove products from inventory' },
      { key: 'products.stock_adjust', label: 'Adjust Stock Levels', description: 'Can perform manual stock level adjustments' },
    ],
  },
  {
    id: 'customers',
    name: 'Customers & Ledger',
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
    description: 'Supplier purchases, GST separation, and business expenses',
    permissions: [
      { key: 'purchases.view', label: 'View All Purchases', description: 'Can view all purchase bills and expenses' },
      { key: 'purchases.view_gst', label: 'View GST Purchase Bills', description: 'Can view GST supplier purchase bills' },
      { key: 'purchases.view_estimate', label: 'View Estimate Purchase Bills', description: 'Can view Estimate / Non-GST purchase bills' },
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
    id: 'restaurant',
    name: 'Restaurant & Kitchen',
    description: 'Restaurant mode: table orders, kitchen tickets, voids and setup',
    permissions: [
      { key: 'restaurant.orders', label: 'Take Orders', description: 'Can open orders, add items, send kitchen tickets and print guest checks' },
      { key: 'restaurant.void', label: 'Void Kitchen Items', description: 'Can void items already sent to the kitchen and cancel orders' },
      { key: 'restaurant.transfer', label: 'Move / Merge / Split', description: 'Can move tables, merge or split orders and change the waiter' },
      { key: 'restaurant.manage', label: 'Restaurant Setup', description: 'Can manage tables, kitchen stations, printers, add-ons and the service charge' },
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
    'BILLING': [
      'sales.view', 'sales.view_gst', 'sales.view_estimate',
      'sales.create', 'sales.create_gst', 'sales.create_estimate',
      'sales.edit', 'sales.discount', 'sales.refund', 'sales.reprint'
    ],
    'INVENTORY': ['products.view', 'products.view_gst', 'products.view_estimate', 'products.create', 'products.create_gst', 'products.create_estimate', 'products.edit', 'products.stock_adjust'],
    'CUSTOMERS': ['customers.view', 'customers.create', 'customers.edit', 'customers.ledger'],
    'PURCHASES': ['purchases.view', 'purchases.view_gst', 'purchases.view_estimate', 'purchases.create', 'purchases.edit'],
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

  // Handle legacy operational control flags
  if (restrictedList.includes('OPT_VIEW_GST')) {
    allowedPermissions.push('products.view_gst', 'sales.view_gst', 'purchases.view_gst');
  }
  if (restrictedList.includes('OPT_VIEW_COST')) {
    allowedPermissions.push('products.view_cost');
  }
  if (restrictedList.includes('OPT_EDIT_PRICE')) {
    allowedPermissions.push('sales.edit_price');
  }
  if (restrictedList.includes('OPT_APPLY_DISCOUNT')) {
    allowedPermissions.push('sales.discount');
  }
  if (restrictedList.includes('OPT_DELETE_INVOICE')) {
    allowedPermissions.push('sales.delete');
  }

  return Array.from(new Set(allowedPermissions));
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
  if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'OWNER') {
    return true;
  }
  
  const userPerms = user.permissions || [];
  if (userPerms.includes('*')) return true;

    // Direct check
    if (userPerms.includes(permissionKey)) return true;

    // Parent permission check: if user has parent permission, grant child permission
    if (permissionKey === 'sales.view_gst' || permissionKey === 'sales.view_estimate') {
      if (userPerms.includes('sales.view')) return true;
    }
    if (permissionKey === 'sales.create_gst' || permissionKey === 'sales.create_estimate') {
      if (userPerms.includes('sales.create')) return true;
    }
    if (permissionKey === 'products.view_gst' || permissionKey === 'products.view_estimate') {
      if (userPerms.includes('products.view')) return true;
    }
    if (permissionKey === 'products.create_gst' || permissionKey === 'products.create_estimate') {
      if (userPerms.includes('products.create')) return true;
    }
    if (permissionKey === 'purchases.view_gst' || permissionKey === 'purchases.view_estimate') {
      if (userPerms.includes('purchases.view')) return true;
    }

    // Child -> Parent permission check: if checking module view/create, grant if user has ANY child permission in that module
    if (permissionKey === 'sales.create') {
      if (userPerms.some(p => p.startsWith('sales.create') || p === 'sales.create_gst' || p === 'sales.create_estimate')) return true;
    }
    if (permissionKey === 'sales.view') {
      if (userPerms.some(p => p.startsWith('sales.'))) return true;
    }
    if (permissionKey === 'products.view') {
      if (userPerms.some(p => p.startsWith('products.'))) return true;
    }
    if (permissionKey === 'purchases.view') {
      if (userPerms.some(p => p.startsWith('purchases.'))) return true;
    }
    if (permissionKey === 'cash_register.view') {
      if (userPerms.some(p => p.startsWith('cash_register.'))) return true;
    }
    if (permissionKey === 'quotations.view') {
      if (userPerms.some(p => p.startsWith('quotations.'))) return true;
    }
    if (permissionKey === 'scrap.view') {
      if (userPerms.some(p => p.startsWith('scrap.'))) return true;
    }
    if (permissionKey === 'warranties.view') {
      if (userPerms.some(p => p.startsWith('warranties.'))) return true;
    }
    if (permissionKey === 'combos.view') {
      if (userPerms.some(p => p.startsWith('combos.'))) return true;
    }
    if (permissionKey === 'reports.view') {
      if (userPerms.some(p => p.startsWith('reports.'))) return true;
    }
    if (permissionKey === 'settings.view') {
      if (userPerms.some(p => p.startsWith('settings.'))) return true;
    }
    if (permissionKey === 'customers.view') {
      if (userPerms.some(p => p.startsWith('customers.'))) return true;
    }
    if (permissionKey === 'users.view') {
      if (userPerms.some(p => p.startsWith('users.'))) return true;
    }

    // Legacy fallback check from restrictedPage string if present
    if (user.restrictedPage) {
      const legacyPerms = convertLegacyRestrictedPageToPermissions(user.restrictedPage);
      if (legacyPerms.includes(permissionKey)) return true;
    }

    return false;
}

/**
 * True for the legacy auth role 'BILLER'. Auth roles are normalised to 'STAFF' (server login and the POS store), so
 * this is always false today: the biller-only options it guards (OPT_VIEW_GST, OPT_VIEW_GST_INVOICES_ONLY) are not
 * enforced. Whether they should apply to STAFF is a product decision (see docs/architecture/06-change-guide.md).
 */
export function isLegacyBillerRole(role: string | null | undefined): boolean {
  return role === 'BILLER';
}

export function isAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.toUpperCase().trim();
  return r === 'ADMIN' || r === 'OWNER' || r === 'SUPER_ADMIN' || r === 'ADMINISTRATOR';
}

export function formatRoleName(role: string | null | undefined): string {
  if (!role) return 'Staff';
  const r = role.toUpperCase().trim();
  if (r === 'SUPER_ADMIN') return 'Super Admin';
  if (r === 'ADMIN' || r === 'OWNER' || r === 'ADMINISTRATOR') return 'Admin';
  return 'Staff';
}


