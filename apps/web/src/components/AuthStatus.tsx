import { useEffect, useState } from "react";
import { clearStoredAuthToken, fetchCurrentUser, getStoredAuthToken, type AuthUserPayload } from "../world/worldApi";

export function AuthStatus() {
  const [user, setUser] = useState<AuthUserPayload | null>(null);

  useEffect(() => {
    if (!getStoredAuthToken()) {
      return;
    }
    let active = true;
    void fetchCurrentUser()
      .then((nextUser) => {
        if (active) {
          setUser(nextUser);
        }
      })
      .catch(() => {
        clearStoredAuthToken();
        if (active) {
          setUser(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (!user) {
    return (
      <div className="auth-status">
        <a className="text-link" href="/login">
          로그인
        </a>
      </div>
    );
  }

  return (
    <div className="auth-status">
      <span>{user.nickname}</span>
      <a className="text-link" href="/maps">
        내 지도
      </a>
      <button
        type="button"
        className="secondary-button compact-button"
        onClick={() => {
          clearStoredAuthToken();
          window.location.assign("/login");
        }}
      >
        로그아웃
      </button>
    </div>
  );
}
