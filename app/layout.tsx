import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { AccountAccessGate } from '@/components/account-access-gate';

export const metadata: Metadata = {
  title: 'VYROX Arena — BGMI & Free Fire Tournaments',
  description: 'Join BGMI and Free Fire tournaments, manage team registrations, and compete in custom lobbies on VYROX Arena.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg', apple: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-brand-500 selection:text-white">
        <AuthProvider>
          <AccountAccessGate>
            <Navbar />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </AccountAccessGate>
        </AuthProvider>
      </body>
    </html>
  );
}
