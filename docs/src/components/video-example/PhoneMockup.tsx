import Image from "next/image";
import type { ReactNode } from "react";

interface PhoneMockupProps {
  children: ReactNode;
}

export function PhoneMockup({ children }: PhoneMockupProps) {
  return (
    <div className="relative w-fit h-full" style={{ clipPath: "inset(0 round 18.46% / 9.20%)" }}>
      {/* Frame image: establishes dimensions, sits on top */}
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

      {/* Screen content, positioned behind the frame */}
      <div className="absolute inset-0 z-0 bg-black">{children}</div>
    </div>
  );
}
