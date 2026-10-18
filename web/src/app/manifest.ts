import type { MetadataRoute } from "next";

/** Lets staff add the app to their phone home screen ("Add to Home Screen" / "Install app"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Heavyworks Garage",
    short_name: "Heavyworks",
    start_url: "/jobs",
    display: "standalone",
    background_color: "#1a1f26",
    theme_color: "#1a1f26",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
