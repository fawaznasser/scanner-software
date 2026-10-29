"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, FileSearch, LockKeyhole, Mail, ScanLine, ShieldCheck } from "lucide-react";

const CNRS_LOGO_URL = "https://pbs.twimg.com/profile_images/1914297483871551488/QOWuSKqc.jpg";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Unable to sign in.");
        return;
      }

      const requestedPath = new URLSearchParams(window.location.search).get("next");
      const destination = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
      router.replace(destination);
      router.refresh();
    } catch {
      setError("The sign-in service is unavailable. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <main className="sign-in-page">
      <section className="sign-in-visual">
        <div className="sign-in-brand"><span><img src={CNRS_LOGO_URL} alt="CNRS-L logo" /></span><div><strong>DMS</strong><small>CNRS document management System</small></div></div>
        <div className="sign-in-message">
          <span className="eyebrow"><ShieldCheck /> Secure document workspace</span>
          <h1>Your documents.<br />Organized and searchable.</h1>
          <p>Scan, manage, search, and securely share CNRS documents from one central workspace.</p>
          <div className="sign-in-features"><span><ScanLine /> Fast document scanning</span><span><FileSearch /> Find documents by name and number</span><span><Check /> Access based on each user’s role</span></div>
        </div>
        <p className="sign-in-copyright">CNRS-L · Document Management System</p>
      </section>

      <section className="sign-in-form-side">
        <div className="sign-in-card">
          <div className="sign-in-mobile-brand"><img src={CNRS_LOGO_URL} alt="CNRS-L logo" /><strong>DMS</strong></div>
          <span className="sign-in-kicker">Welcome back</span>
          <h2>Sign in to DMS</h2>
          <p>Enter your assigned email address and personal password.</p>

          <form onSubmit={submit}>
            <label className="sign-in-field"><span>Email address</span><div><Mail /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></div></label>
            <label className="sign-in-field"><span>Password</span><div><LockKeyhole /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
            {error && <div className="sign-in-error" role="alert">{error}</div>}
            <button className="primary sign-in-submit" type="submit" disabled={submitting}>{submitting ? "Signing in…" : <>Sign in <ArrowRight /></>}</button>
          </form>

        </div>
      </section>
    </main>
  );
}

