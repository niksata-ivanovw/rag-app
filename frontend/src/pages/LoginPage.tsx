import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './authErrors';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // On success the token is saved and the route guard redirects into the app
      await login(email, password);
    } catch (err) {
      setError(authErrorMessage(err, 'login'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Вход" subtitle="Влезте в акаунта си, за да видите документите и чата си.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <label className="form-field">
          <span className="form-label">Имейл</span>
          <input
            className="form-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="form-field">
          <span className="form-label">Парола</span>
          <input
            className="form-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <div className="upload-status-banner error" role="alert">
            <AlertCircle size={18} className="status-icon" />
            <span className="status-content">{error}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary auth-submit" disabled={submitting || !email || !password}>
          {submitting ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
          Вход
        </button>
      </form>

      <p className="auth-switch">
        Нямате акаунт?{' '}
        <Link to="/register" state={location.state}>
          Регистрирайте се
        </Link>
      </p>
    </AuthLayout>
  );
};

export default LoginPage;
