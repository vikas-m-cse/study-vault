import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./auth-screen.css";

type AuthMode = "login" | "signup";

export default function AuthScreen() {
    const [mode, setMode] = useState<AuthMode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!supabase) return;
        setBusy(true);
        setError("");
        setMessage("");
        try {
            if (mode === "signup") {
                const { data, error: authError } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: { emailRedirectTo: window.location.origin },
                });
                if (authError) throw authError;
                if (!data.session) setMessage("Account created. Check your email to confirm your address, then sign in.");
            } else {
                const { error: authError } = await supabase.auth.signInWithPassword({
                    email: email.trim(),
                    password,
                });
                if (authError) throw authError;
            }
        } catch (authError) {
            setError(authError instanceof Error ? authError.message : "Authentication failed. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    async function handleGoogleSignIn() {
        if (!supabase) return;
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const { error: authError } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: window.location.origin },
            });
            if (authError) throw authError;
        } catch (authError) {
            setError(authError instanceof Error ? authError.message : "Google sign-in could not be started.");
            setBusy(false);
        }
    }

    async function handlePasswordReset() {
        if (!supabase) return;
        if (!email.trim()) {
            setError("Enter your email address first.");
            return;
        }
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: window.location.origin,
            });
            if (authError) throw authError;
            setMessage("If an account exists for that email, a password reset link will be sent.");
        } catch (authError) {
            setError(authError instanceof Error ? authError.message : "Could not send the reset email.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card" aria-labelledby="auth-title">
                <div className="auth-brand"><div className="auth-brand-mark">S</div><span>StudyVault</span></div>
                <div className="auth-heading">
                    <p className="auth-eyebrow">YOUR PERSONAL LEARNING SPACE</p>
                    <h1 id="auth-title">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
                    <p>{mode === "login" ? "Sign in to continue your learning journey." : "Set up your secure StudyVault account."}</p>
                </div>
                {!supabase ? (
                    <div className="auth-notice" role="alert">
                        <strong>Supabase setup required</strong>
                        <span>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local .env file, then restart the development server.</span>
                    </div>
                ) : (
                    <>
                        <button className="auth-google-button" type="button" onClick={handleGoogleSignIn} disabled={busy}>
                            <svg viewBox="0 0 48 48" aria-hidden="true">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.73 6C44.43 37.98 46.98 31.95 46.98 24.55Z" />
                                <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.55 2.56 10.78l7.97-6.19Z" />
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                            </svg>
                            Continue with Google
                        </button>
                        <div className="auth-divider"><span>or continue with email</span></div>
                        <form className="auth-form" onSubmit={handleSubmit}>
                            <label htmlFor="auth-email">Email address</label>
                            <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
                            <div className="auth-password-label">
                                <label htmlFor="auth-password">Password</label>
                                {mode === "login" && <button type="button" className="auth-text-button" onClick={handlePasswordReset} disabled={busy}>Forgot password?</button>}
                            </div>
                            <input id="auth-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required />
                            {error && <p className="auth-error" role="alert">{error}</p>}
                            {message && <p className="auth-success" role="status">{message}</p>}
                            <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
                        </form>
                        <p className="auth-switch">
                            {mode === "login" ? "New to StudyVault?" : "Already have an account?"}
                            <button type="button" className="auth-text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>
                                {mode === "login" ? "Create an account" : "Sign in"}
                            </button>
                        </p>
                    </>
                )}
                <p className="auth-footer">A focused space for everything you learn.</p>
            </section>
        </main>
    );
}
