import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f8fafc",
    categories: ["medical", "productivity", "utilities"],
    description:
      "Sistema interno de fila digital em tempo real para clínica de radiologia odontológica.",
    display: "standalone",
    icons: [
      {
        sizes: "192x192",
        src: "/icon?size=192",
        type: "image/png",
      },
      {
        sizes: "512x512",
        src: "/icon?size=512",
        type: "image/png",
      },
    ],
    lang: "pt-BR",
    name: "Fila Digital Clínica",
    short_name: "Fila Clínica",
    start_url: "/atendimento",
    theme_color: "#0f172a",
  };
}
