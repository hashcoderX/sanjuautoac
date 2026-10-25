import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ServiceOS",
    short_name: "SO",
    description: "ServiceOS - Business Management System with HRM, payroll, and operations.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0891b2",
    orientation: "portrait",
    icons: [
      {
        src: "/pabasara sweets.jpeg",
        sizes: "192x192",
        type: "image/jpeg",
      },
      {
        src: "/pabasara sweets.jpeg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
