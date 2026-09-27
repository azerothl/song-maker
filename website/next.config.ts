import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Vercel-native deploy. For static hosting, set OUTPUT=export and rebuild.
  ...(process.env.OUTPUT === "export" ? { output: "export" as const } : {}),
  images: {
    unoptimized: process.env.OUTPUT === "export",
  },
  transpilePackages: ["next-mdx-remote"],
};

export default withNextIntl(nextConfig);
