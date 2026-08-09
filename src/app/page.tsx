import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";
import { getLatestCourse } from "@/lib/courses";

// 강좌를 새로 만들면 홈 카드에도 1분 안에 반영된다.
export const revalidate = 60;

export default async function Home() {
  const featured = await getLatestCourse();

  return (
    <>
      <Header />
      <main>
        <Hero featured={featured} />
      </main>
      <Footer />
    </>
  );
}
