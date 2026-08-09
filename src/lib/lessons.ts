export type Lesson = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
  video_url: string | null;
  material_url: string | null;
  is_free: boolean;
};

export const LESSON_COLUMNS =
  "id, course_id, title, description, position, video_url, material_url, is_free";

// YouTube / Vimeo 주소를 iframe 에 넣을 수 있는 형태로 바꾼다.
// 알아보지 못하는 주소는 그대로 두고, 화면에서는 링크로 처리한다.
export function toEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return `https://www.youtube.com/embed${parsed.pathname}`;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith("/embed/")) return url;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "player.vimeo.com") return url;

    return null;
  } catch {
    return null;
  }
}
