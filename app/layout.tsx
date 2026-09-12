import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '런앤로컬 · 강릉 러닝',
  description: '오늘의 시간과 취향에 맞춰, 달려서 만나는 강릉.',
  manifest: '/manifest.webmanifest',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
