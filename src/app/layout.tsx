import type { Metadata } from "next";
import { Funnel_Display, Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const funnelDisplay = Funnel_Display({
  subsets: ["latin"],
  variable: "--font-display-face",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const onest = Onest({
  subsets: ["latin"],
  variable: "--font-body-face",
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Partiu Empreender · Inteligência de Vendas (DRYOS)",
  description: "Vendas, retenção e recompras com consolidação em tempo real",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${funnelDisplay.variable} ${onest.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
