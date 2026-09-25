import "./styles.css";
import "./trends.css";

export const metadata = {
  title: "Blogger 글쓰기 에이전트",
  description: "검색부터 검토, Blogger 발행까지",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
