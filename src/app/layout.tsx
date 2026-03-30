import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Fila Digital | Clinica Radiologica",
  description:
    "Sistema interno de fila digital em tempo real para clinica de radiologia odontologica.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
