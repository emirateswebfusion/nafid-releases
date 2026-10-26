import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import clsx from 'clsx';

interface ScrollTextProps {
  text: string;
  className?: string;
}

export function ScrollText({ text, className = '' }: ScrollTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(6);
  const [hovered, setHovered] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const c = containerRef.current;
      const t = textRef.current;
      if (!c || !t) return;
      const delta = t.scrollWidth - c.clientWidth;
      const over = delta > 2;
      setOverflows(over);
      if (over) {
        setDistance(delta);
        setDuration(Math.min(18, Math.max(4, delta / 25)));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={clsx('overflow-hidden whitespace-nowrap min-w-0', className)}
      title={text}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={overflows
        ? {
            maskImage: hovered
              ? 'linear-gradient(90deg, transparent 0, #000 8px, #000 calc(100% - 12px), transparent 100%)'
              : 'linear-gradient(90deg, #000 0%, #000 calc(100% - 16px), transparent 100%)',
            WebkitMaskImage: hovered
              ? 'linear-gradient(90deg, transparent 0, #000 8px, #000 calc(100% - 12px), transparent 100%)'
              : 'linear-gradient(90deg, #000 0%, #000 calc(100% - 16px), transparent 100%)',
          }
        : undefined}
    >
      <span
        ref={textRef}
        className="inline-block"
        style={overflows && hovered
          ? ({
              animation: `marquee-pingpong ${duration}s ease-in-out infinite`,
              '--marquee-distance': `-${distance}px`,
            } as CSSProperties)
          : undefined}
      >
        {text}
      </span>
    </div>
  );
}

