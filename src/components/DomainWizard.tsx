import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import type { ShopDomain } from '../store/cartStore';
import { Settings, Wrench, Gem, ShoppingCart } from 'lucide-react';

export function DomainWizard() {
  const { shopDomain, setDomain, shopDomainConfirmed, confirmDomain } = useCartStore();
  const { tenantId } = useAuthStore();

  if (shopDomainConfirmed || !window.electronAPI) return null;

  const handleComplete = async () => {
    if (window.electronAPI && tenantId) {
      await window.electronAPI.settingsSet({ 
        tenant_id: tenantId, 
        key: 'isDomainConfirmed', 
        value: true 
      });
    }
    confirmDomain();
  };

  const domains: { id: ShopDomain; name: string; icon: any; desc: string }[] = [
    { id: 'GENERAL', name: 'General Retail', icon: ShoppingCart, desc: 'Standard point of sale for general merchandise.' },
    { id: 'HARDWARE', name: 'Hardware Store', icon: Wrench, desc: 'Includes dimensional attributes and batch tracking.' },
    { id: 'JEWELRY', name: 'Jewelry Shop', icon: Gem, desc: 'Enables live gold rates and serial port weighing scales.' },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl w-full max-w-3xl shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl">
            <Settings className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Domain Setup Wizard</h1>
            <p className="text-neutral-400 mt-1">Select your business type to configure dynamic hardware and UI features.</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-10">
          {domains.map((d) => (
            <button
              key={d.id}
              onClick={() => setDomain(d.id)}
              className={`flex flex-col items-center text-center p-6 rounded-xl border-2 transition-all ${
                shopDomain === d.id
                  ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                  : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700 hover:bg-neutral-900'
              }`}
            >
              <d.icon className={`w-12 h-12 mb-4 ${shopDomain === d.id ? 'text-blue-400' : 'text-neutral-500'}`} />
              <h3 className="text-lg font-bold text-white mb-2">{d.name}</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">{d.desc}</p>
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleComplete}
            className="px-8 py-3 bg-white text-black font-bold rounded-lg hover:bg-neutral-200 transition-colors"
          >
            Complete Setup
          </button>
        </div>
      </div>
    </div>
  );
}
