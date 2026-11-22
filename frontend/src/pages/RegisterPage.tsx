import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertCircle, Loader2, UserPlus } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { AuthLayout } from './AuthLayout';
import { MIN_PASSWORD_LENGTH, authErrorMessage, passwordProblem } from './authErrors';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): string | null => {
    if (!EMAIL_PATTERN.test(email.trim())) return 'Въведете валиден имейл адрес.';
    const problem = passwordProblem(password);
    if (problem) return problem;
    if (password !== confirm) return 'Паролите не съвпадат.';
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const problem = validate();
    setError(problem);
    if (problem) return;

    setSubmitting(true);
    try {
      // Creates the account and logs in; the route guard then redirects into the app
      await register(email, password);
    } catch (err) {
      setError(authErrorMessage(err, 'register'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Регистрация" subtitle="Създайте акаунт. Документите и чатът ви са видими само за вас.">
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
          <span className="form-hint">Поне {MIN_PASSWORD_LENGTH} символа.</span>
        </label>
        <label className="form-field">
          <span className="form-label">Повторете паролата</span>
          <input
            className="form-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>

        {error && (
          <div className="upload-status-banner error" role="alert">
            <AlertCircle size={18} className="status-icon" />
            <span className="status-content">{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary auth-submit"
          disabled={submitting || !email || !password || !confirm}
        >
          {submitting ? <Loader2 size={18} className="spin" /> : <UserPlus size={18} />}
          Създай акаунт
        </button>
      </form>

      <p className="auth-switch">
        Вече имате акаунт?{' '}
        <Link to="/login" state={location.state}>
          Вход
        </Link>
      </p>
    </AuthLayout>
  );
};

export default RegisterPage;
