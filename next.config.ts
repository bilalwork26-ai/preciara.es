import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Calidad usada por las imágenes del hero (src="/images/hero-*.webp").
    qualities: [75, 82],
  },
};

export default nextConfig;
