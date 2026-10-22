import React, { useState, useEffect } from 'react';
import { Megaphone, Plus, Eye, Trash2, Loader2, X, Image as ImageIcon, Phone, Flame, ToggleLeft, ToggleRight, RefreshCw, Heart, Share2 } from 'lucide-react';
import clsx from 'clsx';
import { fetchApi } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { FloatToast, type ToastMessage } from './ui/FloatToast';

interface Advertisement {
  ad_id: string;
  tenant_id: string;
  shop_name: string;
  title: string;
  description: string | null;
  image_url: string;
  aspect_ratio: string;
  contact_phone: string | null;
  call_to_action: string;
  views_count: number;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED';
  created_at: string;
  updated_at: string;
}

interface AdsManagerProps {
  onClose: () => void;
}

export const AdsManager: React.FC<AdsManagerProps> = ({ onClose }) => {
  const { shopName } = useAuthStore();
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', title?: string) => {
    setToast({ text, type, title });
  };

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5' | '16:9'>('1:1');
  const [contactPhone, setContactPhone] = useState('');
  const [callToAction, setCallToAction] = useState('VISIT_STORE');

  const fetchAds = async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/ads/my-ads');
      if (Array.isArray(data)) {
        setAds(data);
      }
    } catch (err: any) {
      const isAuthErr = err.message?.toLowerCase().includes('token') || err.message?.toLowerCase().includes('unauthorized');
      showToast(
        isAuthErr ? 'Session expired or unauthorized. Please re-authenticate to sync ads.' : (err.message || 'Failed to load advertisements'),
        'error',
        isAuthErr ? 'SESSION EXPIRED' : 'ADVERTISEMENTS'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAds();
  }, []);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image file size must be less than 5MB', 'warning', 'IMAGE SIZE');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Please enter an advertisement title', 'warning', 'VALIDATION');
      return;
    }
    if (!imageUrl.trim()) {
      showToast('Please upload or provide an advertisement image', 'warning', 'VALIDATION');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetchApi('/ads', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          image_url: imageUrl.trim(),
          aspect_ratio: aspectRatio,
          contact_phone: contactPhone.trim() || null,
          call_to_action: callToAction,
          shop_name: shopName || 'Our Store',
        }),
      });

      if (res && res.ad_id) {
        showToast('Advertisement published successfully! Visible on customer mobile apps.', 'success', 'PUBLISHED');
        setShowCreateModal(false);
        // Reset form
        setTitle('');
        setDescription('');
        setImageUrl('');
        setContactPhone('');
        fetchAds();
      } else {
        showToast(res?.error || 'Failed to publish advertisement', 'error', 'PUBLISH ERROR');
      }
    } catch (err: any) {
      showToast(err.message || 'Network error while publishing advertisement', 'error', 'PUBLISH ERROR');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (ad: Advertisement) => {
    const newStatus = ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await fetchApi(`/ads/${ad.ad_id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      setAds(prev => prev.map(item => item.ad_id === ad.ad_id ? { ...item, status: newStatus } : item));
      showToast(newStatus === 'ACTIVE' ? 'Advertisement resumed & visible' : 'Advertisement paused', 'info', 'STATUS UPDATED');
    } catch (err: any) {
      showToast(err.message || 'Failed to update ad status', 'error', 'STATUS ERROR');
    }
  };

  const handleDeleteAd = async (adId: string) => {
    if (!window.confirm('Are you sure you want to delete this advertisement?')) return;
    try {
      await fetchApi(`/ads/${adId}`, { method: 'DELETE' });
      setAds(prev => prev.filter(item => item.ad_id !== adId));
      showToast('Advertisement deleted successfully', 'success', 'DELETED');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete advertisement', 'error', 'DELETE ERROR');
    }
  };

  const totalViews = ads.reduce((sum, item) => sum + (item.views_count || 0), 0);
  const activeAdsCount = ads.filter(item => item.status === 'ACTIVE').length;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground font-sans animate-in fade-in duration-200">
      {/* Header bar */}
      <header className="shrink-0 border-b border-border bg-card px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">Advertisements & Promotions</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Publish Instagram-style advertisement cards visible to all customer mobile app users
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={fetchAds}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition cursor-pointer"
            title="Refresh Ads"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin text-amber-500')} />
          </button>
          <button
            onClick={() => {
              setToast(null);
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition cursor-pointer text-xs"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Create Advertisement
          </button>
          <div className="h-5 w-px bg-border mx-0.5" />
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full space-y-6">
        {/* Analytics Hero Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Active Campaigns</span>
              <span className="text-3xl font-black text-foreground mt-1 block">{activeAdsCount}</span>
              <span className="text-[10px] text-muted-foreground mt-1 block font-mono">running right now</span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
              <Flame className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Total Customer Views</span>
              <span className="text-3xl font-black text-foreground mt-1 block">{totalViews}</span>
              <span className="text-[10px] text-muted-foreground mt-1 block font-mono">tracked impressions</span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
              <Eye className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Published Creatives</span>
              <span className="text-3xl font-black text-foreground mt-1 block">{ads.length}</span>
              <span className="text-[10px] text-muted-foreground mt-1 block font-mono">total ad cards</span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center">
              <Megaphone className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Ads Cards Grid */}
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <span className="text-xs font-mono uppercase tracking-widest">Loading advertisements...</span>
          </div>
        ) : ads.length === 0 ? (
          <div className="h-80 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border rounded-2xl bg-card/50 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Megaphone className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">No Advertisements Published Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Create your first promotional card to showcase new arrivals, weekend offers, or discounts directly on your customers' mobile screens!
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Publish First Ad
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 sm:gap-6">
            {ads.map((ad) => (
              <div
                key={ad.ad_id}
                className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:border-amber-500/40 transition duration-300 flex flex-col"
              >
                {/* Instagram-style Header */}
                <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-xs">
                      {ad.shop_name?.charAt(0) || 'S'}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground leading-tight">{ad.shop_name}</h4>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(ad.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={clsx(
                        'text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border',
                        ad.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-muted text-muted-foreground border-border'
                      )}
                    >
                      {ad.status}
                    </span>
                  </div>
                </div>

                {/* Ad Image */}
                <div
                  className={clsx(
                    'w-full bg-zinc-950 relative overflow-hidden flex items-center justify-center',
                    ad.aspect_ratio === '1:1' && 'aspect-square',
                    ad.aspect_ratio === '4:5' && 'aspect-[4/5]',
                    ad.aspect_ratio === '16:9' && 'aspect-video'
                  )}
                >
                  <img
                    src={ad.image_url}
                    alt={ad.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as any).src = 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=60';
                    }}
                  />
                  {/* Floating Views Counter Badge */}
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1.5 border border-white/10 shadow-lg">
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span>{ad.views_count} views</span>
                  </div>
                </div>

                {/* Ad Content & Details */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{ad.title}</h3>
                    {ad.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {ad.description}
                      </p>
                    )}
                  </div>

                  {ad.contact_phone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                      <Phone className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{ad.contact_phone}</span>
                    </div>
                  )}

                  {/* Card Actions Footer */}
                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <button
                      onClick={() => handleToggleStatus(ad)}
                      className={clsx(
                        'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition cursor-pointer',
                        ad.status === 'ACTIVE'
                          ? 'border-amber-500/20 text-amber-500 hover:bg-amber-500/10'
                          : 'border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10'
                      )}
                    >
                      {ad.status === 'ACTIVE' ? (
                        <>
                          <ToggleRight className="w-4 h-4 text-emerald-500" />
                          Pause
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                          Activate
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteAd(ad.ad_id)}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition border border-transparent hover:border-destructive/20 cursor-pointer"
                      title="Delete Advertisement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Advertisement Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <Plus className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Create New Advertisement</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Will be displayed on customers' mobile app home feed
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateAd} className="p-6 overflow-y-auto space-y-5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Form Inputs Column */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">
                      Ad Title / Headline *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Weekend Mega Sale - 30% OFF!"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">
                      Description / Caption
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Describe the offer, discount code, or terms..."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">
                      Card Aspect Ratio
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['1:1', '4:5', '16:9'] as const).map(ratio => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setAspectRatio(ratio)}
                          className={clsx(
                            'py-2 text-xs font-bold rounded-xl border transition cursor-pointer',
                            aspectRatio === ratio
                              ? 'bg-amber-500/10 border-amber-500 text-amber-500'
                              : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {ratio === '1:1' ? '1:1 Square' : ratio === '4:5' ? '4:5 Portrait' : '16:9 Wide'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">
                      Advertisement Image *
                    </label>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="block w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-500/10 file:text-amber-600 dark:file:text-amber-400 hover:file:bg-amber-500/20 cursor-pointer"
                      />
                      <span className="text-[10px] text-muted-foreground block">Or paste image URL:</span>
                      <input
                        type="url"
                        placeholder="https://example.com/banner.jpg"
                        value={imageUrl.startsWith('data:') ? '' : imageUrl}
                        onChange={e => setImageUrl(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-foreground block mb-1">
                        Contact Phone / WhatsApp
                      </label>
                      <input
                        type="text"
                        placeholder="+91 98765 43210"
                        value={contactPhone}
                        onChange={e => setContactPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground block mb-1">
                        Call To Action
                      </label>
                      <select
                        value={callToAction}
                        onChange={e => setCallToAction(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="VISIT_STORE">Visit Store</option>
                        <option value="CALL_NOW">Call Shop</option>
                        <option value="WHATSAPP">WhatsApp Us</option>
                        <option value="VIEW_OFFER">View Offer</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Live Card Preview Column */}
                <div className="flex flex-col items-center justify-center p-4 bg-muted/20 border border-border rounded-2xl">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 font-bold">
                    📱 Mobile Feed Preview
                  </span>

                  {/* Card Simulator */}
                  <div className="w-full max-w-xs bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
                    <div className="p-3 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-[10px]">
                          {shopName?.charAt(0) || 'S'}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-foreground block leading-none">{shopName || 'Store Name'}</span>
                          <span className="text-[9px] text-muted-foreground font-mono">Sponsored</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">Just now</span>
                    </div>

                    <div
                      className={clsx(
                        'w-full bg-zinc-900 flex items-center justify-center overflow-hidden',
                        aspectRatio === '1:1' && 'aspect-square',
                        aspectRatio === '4:5' && 'aspect-[4/5]',
                        aspectRatio === '16:9' && 'aspect-video'
                      )}
                    >
                      {imageUrl ? (
                        <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center text-muted-foreground p-4">
                          <ImageIcon className="w-8 h-8 mx-auto opacity-40 mb-1" />
                          <span className="text-[10px]">Image preview</span>
                        </div>
                      )}
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <Heart className="w-4 h-4" />
                          <Share2 className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-bold text-amber-500">0 views</span>
                      </div>

                      <div className="text-xs">
                        <span className="font-bold text-foreground mr-1.5">{title || 'Offer Headline'}</span>
                        <span className="text-muted-foreground">{description || 'Offer details will appear here...'}</span>
                      </div>

                      <div className="pt-2">
                        <div className="w-full py-1.5 bg-amber-500 text-zinc-950 font-bold text-center rounded-lg text-[11px]">
                          {callToAction.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-muted text-foreground rounded-xl text-xs font-semibold border border-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <Megaphone className="w-3.5 h-3.5" />
                      Publish Advertisement
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      <FloatToast
        message={toast}
        onClose={() => setToast(null)}
        position="bottom-right"
        duration={4000}
      />
    </div>
  );
};
