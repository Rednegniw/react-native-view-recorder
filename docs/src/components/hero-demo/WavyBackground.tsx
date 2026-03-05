const WAVE_LAYERS = [
  {
    id: "wg1",
    x2: "0.3",
    colors: ["#5c1515", "#3d0c0c"],
    path: "M-30 860 L-30 420 C20 370, 90 340, 160 400 C230 460, 250 350, 340 380 C400 400, 440 340, 490 370 L490 860 Z",
    animation: "wave-drift-1 12s ease-in-out infinite",
  },
  {
    id: "wg2",
    x1: "0.1",
    colors: ["#7a1818", "#5e1010"],
    path: "M-30 860 L-30 490 C40 440, 100 530, 170 475 C220 435, 280 510, 330 470 C380 430, 430 490, 490 450 L490 860 Z",
    animation: "wave-drift-2 16s ease-in-out infinite",
  },
  {
    id: "wg3",
    y1: "0.2",
    x2: "0.4",
    colors: ["#9a1e2e", "#821828"],
    path: "M-30 860 L-30 560 C50 520, 80 590, 150 545 C210 505, 250 580, 310 550 C370 520, 420 575, 490 545 L490 860 Z",
    animation: "wave-drift-3 10s ease-in-out infinite",
  },
  {
    id: "wg4",
    x1: "0.3",
    colors: ["#a02845", "#88223b"],
    path: "M-30 860 L-30 640 C60 595, 130 660, 190 620 C260 575, 300 645, 370 605 C420 580, 460 625, 490 610 L490 860 Z",
    animation: "wave-drift-4 14s ease-in-out infinite",
  },
  {
    id: "wg5",
    x2: "0.5",
    colors: ["#8a3555", "#753050"],
    path: "M-30 860 L-30 710 C80 670, 140 725, 220 690 C290 660, 350 715, 410 685 C445 670, 475 700, 490 690 L490 860 Z",
    animation: "wave-drift-5 18s ease-in-out infinite",
  },
];

export function WavyBackground() {
  return (
    <>
      {WAVE_LAYERS.map((layer) => (
        <div
          key={layer.id}
          className="absolute inset-[-30px]"
          style={{ willChange: "transform", animation: layer.animation }}
        >
          <svg
            role="none"
            viewBox="0 0 460 860"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
          >
            <defs>
              <linearGradient
                id={layer.id}
                x1={layer.x1 ?? "0"}
                y1={layer.y1 ?? "0"}
                x2={layer.x2 ?? "0"}
                y2="1"
              >
                <stop offset="0%" stopColor={layer.colors[0]} />
                <stop offset="100%" stopColor={layer.colors[1]} />
              </linearGradient>
            </defs>
            <path d={layer.path} fill={`url(#${layer.id})`} />
          </svg>
        </div>
      ))}
    </>
  );
}
