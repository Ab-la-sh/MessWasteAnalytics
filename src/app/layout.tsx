import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'MessWaste Analytics',
  description: 'Food-wastage collection and analytics across college mess halls.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              className: 'font-sans',
              style: {
                borderRadius: '0.75rem',
                border: '1px solid #e9ebf7',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
