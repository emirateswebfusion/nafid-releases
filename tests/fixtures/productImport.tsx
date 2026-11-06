import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/index.css';
import { DataUploadModal } from '../../src/components/data-upload/DataUploadModal';
import { useAuthStore } from '../../src/store/authStore';
import { productsApi } from '../../src/data/products';

// Run only with the isolated Electron fixture host; never log in or connect it to a real tenant.
const tenant = '00000000-0000-4000-8000-000000000006';
useAuthStore.setState({ tenantId: tenant, userId: 'import-test', userName: 'Import test', role: 'ADMIN' });
export function ImportFixture() {
  const [open, setOpen] = useState(true);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState('No products imported');
  return <main className="p-5">
    <h1>Isolated inventory import verification</h1>
    <p>Saved products: {count}. {status}</p>
    <button onClick={() => setOpen(true)}>Open product import</button>
    <DataUploadModal isOpen={open} onClose={() => setOpen(false)} defaultEntity="products"
      allowedEntities={['products']} hideEntityTabs onImportSuccess={async () => {
        const products = await productsApi.getProducts(tenant);
        if (Array.isArray(products)) { setCount(products.length); setStatus('Saved to isolated SQLite'); }
      }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<ImportFixture />);
