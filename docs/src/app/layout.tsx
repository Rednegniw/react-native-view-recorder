import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import "./global.css";
import { Inter } from "next/font/google";

export const metadata: Metadata = {
  metadataBase: new URL("https://react-native-view-recorder.awingender.com"),
  title: {
    default: "React Native View Recorder",
    template: "%s | React Native View Recorder",
  },
  description:
    "Record any React Native view to MP4 video. Frame-by-frame capture with hardware-accelerated H.264/HEVC encoding. No FFmpeg, no GPL.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "React Native View Recorder",
    locale: "en_US",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@WingederA",
  },
};

const inter = Inter({
  subsets: ["latin"],
});

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          theme={{
            defaultTheme: "dark",
            forcedTheme: "dark",
            enableSystem: false,
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
