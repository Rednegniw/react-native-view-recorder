import { Inter, Zen_Old_Mincho } from "next/font/google";
import React from "react";

export const SkipAnimationContext = React.createContext(false);

export const zenOldMincho = Zen_Old_Mincho({ subsets: ["latin"], weight: ["700", "400"] });
export const inter = Inter({ subsets: ["latin"] });

export const EASE_SMOOTH = [0.22, 1, 0.36, 1] as const;
export const EASE_OUT = [0, 0, 0.58, 1] as const;
