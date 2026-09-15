import type { Browser } from "puppeteer-core";

// HTML 문자열을 PDF 버퍼로 바꾼다. 배포 환경(Vercel)에서는 @sparticuz/chromium이 주는
// 서버리스용 크로미움 바이너리를 쓰고, 로컬 개발에서는 이 컴퓨터에 설치된 Chrome을 그대로 쓴다.
async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const localPath =
    process.env.CHROME_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return puppeteer.launch({ executablePath: localPath, headless: true });
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    // 웹폰트(Noto Sans KR, worksheet-html.ts)는 "load" 이벤트 이후에도 비동기로 계속
    // 받아지는 중일 수 있어서(FOIT/FOUT), 이 시점에 바로 PDF를 찍으면 한글이 깨져 보일 수
    // 있다. 실제로 다 받아질 때까지 명시적으로 기다린다(2026-09-15, 배포 중 한글 깨짐 발견 —
    // 로컬은 시스템에 "맑은 고딕"이 있어서 이 문제가 안 보였음).
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "12mm", bottom: "14mm", left: "10mm", right: "10mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="font-size:8px; color:#9AA5BE; width:100%; text-align:center; font-family: sans-serif;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
