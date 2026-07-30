import type { Metadata } from "next";
import { Inter, Libre_Caslon_Text } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const caslon = Libre_Caslon_Text({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-heading-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Captação Versalhes",
  description: "Leads inscritos por formulário e origem",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${caslon.variable}`}>
      <body>{children}</body>
    </html>
  );
}
