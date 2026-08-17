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
  const [duration, setDuration] = useState(8);
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
        setDuration(Math.min(24, Math.max(6, delta / 40)));
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
      className={clsx('overflow-hidden whitespace-nowrap', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={overflows
        ? {
            maskImage: 'linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%)',
          }
        : undefined}
    >
      <span
        ref={textRef}
        className="inline-block"
        style={overflows && hovered
          ? ({
              animation: `marquee-x ${duration}s linear infinite`,
              '--marquee-distance': `-${distance}px`,
            } as CSSProperties)
          : undefined}
      >
        {text}
      </span>
    </div>
  );
}
