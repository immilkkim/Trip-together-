import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Trip Together｜獨立版體驗', description: '邀請加入、每日活動及撞期驗證' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
