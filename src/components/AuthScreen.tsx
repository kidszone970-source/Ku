import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Leaf,
  Lock,
  Mail,
  MessageSquare,
  Scale,
  User,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { InlineMacroRow } from './NutrientVisuals';

type AuthMode = 'login' | 'signup' | 'forgot';

interface AuthScreenProps {
  onStartPreview?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onStartPreview }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/operation-not-allowed') {
      return 'Email/Password sign-in is not yet enabled in your Firebase Console. Please use Google Sign-In below, or enable Email/Password under Firebase Console → Authentication → Sign-in method.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Incorrect email or password. Double-check your credentials or reset your password.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (code === 'auth/weak-password') {
      return 'Please choose a stronger password with at least 6 characters.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Google sign-in popup was closed before completing. Please try again.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Your browser blocked the sign-in popup. Please allow popups for this site and try again.';
    }
    return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, email.trim());
        setInfoMessage('Password reset instructions have been sent to your email address.');
        setMode('login');
      } else if (mode === 'signup') {
        if (!fullName.trim()) {
          setError('Please enter your full name.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: fullName.trim() });
        await sendEmailVerification(cred.user).catch(() => {});
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#ECECE8] dark:bg-[#111210] flex flex-col lg:flex-row">
      {/* Left Brand Showcase Column */}
      <div className="lg:w-1/2 bg-[#151513] text-white p-8 lg:p-14 flex flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#A3F056] text-[#151513] flex items-center justify-center">
            <Leaf className="w-5 h-5" />
          </div>
          <span className="text-xl font-extrabold tracking-tight font-[var(--font-display)]">
            NutriPulse
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className="my-10 lg:my-0 max-w-lg space-y-6"
        >
          <p className="text-sm font-semibold text-[#A3F056]">
            Personal Nutrition Coach & Smart Calorie Tracker
          </p>
          <h1 className="text-3xl lg:text-5xl font-extrabold tracking-tight leading-[1.1]">
            <span className="block text-white">Let&rsquo;s Check Your</span>
            <span className="block text-[#9C9C94]">Meals Together.</span>
          </h1>
          <p className="text-[#C8C8C2] text-base leading-relaxed">
            Scan plates with AI visual breakdown, read nutrition labels cleanly, track color-coded
            carbs, fats, and protein, and follow evidence-based daily calorie estimates.
          </p>

          {/* Compact Color-Coded Macro Sample Card */}
          <div className="p-4 rounded-2xl bg-white/[0.06] border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">Color-Coded Nutrient Clarity</span>
              <span className="font-mono text-[#A3F056]">BMR · TDEE · Macros</span>
            </div>
            <InlineMacroRow carbs={42} fat={14} protein={28} fiber={8} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10">
            <div className="space-y-1.5">
              <Camera className="w-5 h-5 text-[#A3F056]" />
              <p className="text-sm font-semibold">4-Way Scanner</p>
              <p className="text-xs text-[#A1A19A]">Camera, gallery, label OCR & verified search</p>
            </div>
            <div className="space-y-1.5">
              <MessageSquare className="w-5 h-5 text-[#A3F056]" />
              <p className="text-sm font-semibold">AI Coach Chat</p>
              <p className="text-xs text-[#A1A19A]">Natural meal logging & tailored guidance</p>
            </div>
            <div className="space-y-1.5">
              <Scale className="w-5 h-5 text-[#A3F056]" />
              <p className="text-sm font-semibold">Clinical Math</p>
              <p className="text-xs text-[#A1A19A]">Transparent BMR/TDEE & age-safe checks</p>
            </div>
          </div>
        </motion.div>

        <p className="text-xs text-[#8C8C85]">
          Private per-user records secured in Firestore · Transparent nutrition estimates
        </p>
      </div>

      {/* Right Auth Form Column */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="w-full max-w-md bg-white dark:bg-[#1B1C19] rounded-[32px] p-7 sm:p-8 card-soft border border-black/[0.04] dark:border-white/10 space-y-6"
        >
          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold text-[#171715] dark:text-[#F4F4F0]">
              {mode === 'login'
                ? 'Welcome back'
                : mode === 'signup'
                  ? 'Create your account'
                  : 'Reset your password'}
            </h2>
            <p className="text-sm text-[#787872] dark:text-[#A1A19A]">
              {mode === 'login'
                ? 'Sign in to access your daily nutrition diary and AI coach.'
                : mode === 'signup'
                  ? 'Complete our quick 7-step personalized setup after sign up.'
                  : 'Enter your email and we will send you a password reset link.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-[#FDECEC] dark:bg-[#E5484D]/15 border border-[#E5484D]/25 text-[#B42328] dark:text-[#FCA5A5] text-sm leading-relaxed"
            >
              {error}
            </div>
          )}

          {infoMessage && (
            <div className="p-3.5 rounded-2xl bg-[#EEF8E8] dark:bg-[#54A630]/15 border border-[#54A630]/25 text-[#346E1B] dark:text-[#86E05C] text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {mode !== 'forgot' && (
            <>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full h-12 rounded-full bg-[#151513] hover:bg-[#2B2B28] dark:bg-white dark:text-[#151513] text-white font-bold text-sm flex items-center justify-center gap-3 transition-colors disabled:opacity-60"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.44-1.69 4.22-5.27 4.22-3.17 0-5.76-2.62-5.76-5.85s2.59-5.85 5.76-5.85c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.07 14.69 3.15 12.17 3.15 7.21 3.15 3.2 7.16 3.2 12.15s4.01 9 8.97 9c5.18 0 8.61-3.64 8.61-8.77 0-.59-.06-1.03-.15-1.28z"
                  />
                </svg>
                Continue with Google
              </motion.button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-black/10 dark:border-white/10" />
                <span className="mx-3 text-xs text-[#787872] dark:text-[#9C9C94]">
                  or continue with email
                </span>
                <div className="flex-grow border-t border-black/10 dark:border-white/10" />
              </div>
            </>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-fullname"
                  className="block text-xs font-semibold text-[#787872] dark:text-[#A1A19A]"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#787872] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    required
                    className="w-full h-12 pl-10 pr-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#171715] dark:focus:ring-[#A3F056]"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="auth-email"
                className="block text-xs font-semibold text-[#787872] dark:text-[#A1A19A]"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#787872] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full h-12 pl-10 pr-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#171715] dark:focus:ring-[#A3F056]"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-semibold text-[#787872] dark:text-[#A1A19A]"
                  >
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setInfoMessage(null);
                        setMode('forgot');
                      }}
                      className="text-xs font-semibold text-[#4B962A] dark:text-[#A3F056] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#787872] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    className="w-full h-12 pl-10 pr-4 rounded-2xl bg-[#F4F4F0] dark:bg-[#111210] border border-black/10 dark:border-white/10 text-sm text-[#171715] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#171715] dark:focus:ring-[#A3F056]"
                  />
                </div>
              </div>
            )}

            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              className="w-full h-12 rounded-full bg-[#54A630] hover:bg-[#468D27] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              <span>
                {loading
                  ? 'Please wait...'
                  : mode === 'login'
                    ? 'Sign In with Email'
                    : mode === 'signup'
                      ? 'Create Account'
                      : 'Send Reset Link'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </form>

          <div className="flex items-center justify-between text-sm pt-2 border-t border-black/[0.06] dark:border-white/10">
            {mode === 'login' ? (
              <p className="text-[#787872] dark:text-[#A1A19A]">
                New to NutriPulse?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('signup');
                  }}
                  className="font-bold text-[#171715] dark:text-[#A3F056] hover:underline"
                >
                  Create account
                </button>
              </p>
            ) : (
              <p className="text-[#787872] dark:text-[#A1A19A]">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('login');
                  }}
                  className="font-bold text-[#171715] dark:text-[#A3F056] hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>

          {onStartPreview && (
            <div className="pt-1">
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={onStartPreview}
                className="w-full h-11 rounded-full bg-[#F4F4F0] dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-bold text-[#171715] dark:text-[#F4F4F0] hover:bg-[#EAEAE4] dark:hover:bg-white/10 transition-colors"
              >
                Explore Interactive Guest Session (Local Browser Only)
              </motion.button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
