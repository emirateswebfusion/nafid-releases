import { useEffect, useState } from 'react';

export function SplashScreen() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Small delay to trigger the fade-in animation
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0d1b3e 0%, #0f2460 50%, #102a6e 100%)',
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      {/* Glow rings */}
      <div
        style={{
          position: 'absolute',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)',
          animation: 'splash-pulse 2.4s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,255,0.12) 0%, transparent 70%)',
          animation: 'splash-pulse 2.4s ease-in-out infinite 0.4s',
        }}
      />

      {/* Logo container */}
      <div
        style={{
          position: 'relative',
          width: 120,
          height: 120,
          borderRadius: 28,
          overflow: 'hidden',
          boxShadow: '0 0 40px rgba(0,212,255,0.25), 0 8px 32px rgba(0,0,0,0.5)',
          animation: 'splash-float 3s ease-in-out infinite',
          marginBottom: 28,
        }}
      >
        <img
          src="/logo.png"
          alt="Nafid Logo"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>

      {/* App name */}
      <h1
        style={{
          margin: 0,
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#ffffff',
          textShadow: '0 2px 12px rgba(0,212,255,0.3)',
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        }}
      >
        Nafid
      </h1>

      {/* Tagline */}
      <p
        style={{
          margin: '6px 0 0',
          fontSize: 13,
          color: 'rgba(255,255,255,0.45)',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        }}
      >
        Point of Sale
      </p>

      {/* Spinner */}
      <div
        style={{
          marginTop: 48,
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '2.5px solid rgba(255,255,255,0.15)',
          borderTopColor: '#00d4ff',
          animation: 'splash-spin 0.8s linear infinite',
        }}
      />

      <style>{`
        @keyframes splash-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes splash-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.6; }
        }
        @keyframes splash-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
