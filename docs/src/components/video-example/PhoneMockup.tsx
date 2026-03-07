"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useRef, useState } from "react";

const REFERENCE_WIDTH = 358;
const REFERENCE_HEIGHT = 740;

interface PhoneMockupProps {
  children: ReactNode;
}

export function PhoneMockup({ children }: PhoneMockupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.height / REFERENCE_HEIGHT);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-fit h-full"
      style={{ clipPath: "inset(0 round 18.46% / 9.20%)" }}
    >
      <Image
        src="/iphone-mockup.png"
        alt=""
        width={363}
        height={750}
        className="relative z-10 h-full w-auto pointer-events-none select-none"
        style={{ margin: 0 }}
        draggable={false}
        priority
      />

      <div className="absolute inset-0 z-0 bg-black overflow-hidden">
        <div
          style={{
            width: REFERENCE_WIDTH,
            height: REFERENCE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
