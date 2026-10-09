import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trip Together｜同行行程",
    short_name: "Trip Together",
    description: "給同行團友一起管理每日行程、邀請活動與投票。",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fb",
    theme_color: "#172033",
    lang: "zh-Hant",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
