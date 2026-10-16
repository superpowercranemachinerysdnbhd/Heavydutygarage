import type { Metadata, Viewport } from "next";
import { getI18n } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { default: t("app.name"), template: `%s · ${t("app.name")}` }, description: t("app.tagline"), icons: { icon: "/logo.jpg" } };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

const HTML_LANG = { en: "en", ms: "ms", zh: "zh-Hans" } as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={HTML_LANG[locale]}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" />
      </head>
      <body><I18nProvider locale={locale}>{children}</I18nProvider></body>
    </html>
  );
}
