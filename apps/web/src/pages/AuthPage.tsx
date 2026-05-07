import { useMemo, useState, type FormEvent } from "react";
import { login, signUp } from "../world/worldApi";
import { appName } from "../i18n/korean";

interface AuthPageProps {
  mode: "login" | "signup";
}

export function AuthPage({ mode }: AuthPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const isSignup = mode === "signup";
  const submitLabel = useMemo(() => (isSignup ? "새 기록자 등록" : "기록자 입장"), [isSignup]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      if (isSignup) {
        await signUp(email, password, nickname);
      } else {
        await login(email, password);
      }
      window.location.assign("/editor");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "입장에 실패했습니다");
      setStatus("error");
    }
  }

  return (
    <main className="editor-shell auth-shell">
      <header className="editor-header">
        <div>
          <p>{appName}</p>
          <h1>{submitLabel}</h1>
        </div>
        <nav className="top-nav" aria-label="이동">
          <a className="text-link" href="/editor">
            창조실
          </a>
          <a className="text-link" href={isSignup ? "/login" : "/signup"}>
            {isSignup ? "이미 기록자입니다" : "새 기록자 등록"}
          </a>
        </nav>
      </header>

      <section className="auth-panel" aria-label={submitLabel}>
        <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
          <label>
            <span>이메일</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          {isSignup ? (
            <label>
              <span>별명</span>
              <input type="text" value={nickname} onChange={(event) => setNickname(event.target.value)} required maxLength={80} />
            </label>
          ) : null}
          <label>
            <span>비밀번호</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
          </label>
          <button type="submit" className="generate-button" disabled={status === "submitting"}>
            {status === "submitting" ? "문 열리는 중" : submitLabel}
          </button>
          {error ? <p className="error-line">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
