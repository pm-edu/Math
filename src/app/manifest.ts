import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// PWA 설치(앱처럼 설치) 지원 — 2026-09-14, "강의실에서 브라우저 주소창을 없앨 수 있냐"는
// 요청 때문에 추가함. 최신 브라우저는 보안상 JS로 주소창을 강제로 숨길 방법이 없고,
// 유일한 방법은 사이트를 PWA로 설치해 독립 앱 창으로 여는 것뿐이다(그 창 안에서는
// 같은 출처 이동이라 강의실로 들어가도 계속 주소창 없이 유지된다).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} | 수학 영어 학습사이트`,
    short_name: site.name,
    start_url: "/mypage",
    scope: "/",
    display: "standalone",
    background_color: "#FFF8E7",
    theme_color: "#FFF8E7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
