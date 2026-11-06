import { createRoot } from 'react-dom/client';
import { InventoryManager } from '../../src/components/inventory/InventoryManager';
import { useAuthStore } from '../../src/store/authStore';
import '../../src/index.css';
useAuthStore.setState({ tenantId: '00000000-0000-4000-8000-000000000007', userId: 'inventory-test', userName: 'Inventory test', role: 'ADMIN', permissions: ['*'] });
createRoot(document.getElementById('root')!).render(<InventoryManager onClose={() => {}} />);
