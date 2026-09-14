// PWA 설치 가능 조건 충족용 최소 서비스워커 — 크롬은 매니페스트만으로는 설치 아이콘을
// 띄워주지 않고, fetch 핸들러가 있는 서비스워커 등록까지 있어야 "설치 가능"으로 본다
// (2026-09-14). 오프라인 캐싱 등은 하지 않고 그냥 통과시키기만 한다 — 이 사이트는
// 로그인·실시간 데이터 위주라 캐싱이 오히려 낡은 내용을 보여줄 위험이 크다.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
