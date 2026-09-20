'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { BarChart3, ShieldCheck, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Logo } from '@/components/layout/Logo';

function LoginForm() {
  const { login } = useAuth();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Welcome back');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const nextPath = params.get('next');

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Branding panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-brand-900 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(124,92,255,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(91,95,172,0.35), transparent 45%)',
          }}
        />
        <Logo className="relative z-10 [&_span]:text-white [&_span_span]:text-brand-300" />

        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Turn daily mess data into waste you can actually cut.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-navy-200">
            Track plate, counter, and packaging waste across every mess hall — with weather,
            menu, and calendar context built in from day one.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: Utensils, text: 'One clean daily form per mess, per meal slot' },
              { icon: BarChart3, text: 'Live KPIs, trends, and auto-generated insights' },
              { icon: ShieldCheck, text: 'Role-based access for admins and coordinators' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-navy-100">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4" />
                </div>
                {text}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-navy-300">© {new Date().getFullYear()} MessWaste Analytics</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col items-center justify-center bg-surface-subtle p-8">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-navy-900">Sign in</h2>
          <p className="mt-1 text-sm text-navy-500">Enter your credentials to access your dashboard.</p>

          {nextPath && (
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
              Sign in to continue to <span className="font-medium">{nextPath}</span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@messwaste.local"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-xs text-navy-400">
            Seeded demo accounts: <span className="font-mono">admin@messwaste.local</span> or{' '}
            <span className="font-mono">collector.m1@messwaste.local</span> — see the README for passwords
            printed by <span className="font-mono">npm run seed</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
