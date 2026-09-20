import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Eartype',
  description: 'Treino de listening por ditado com vídeos do YouTube.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
