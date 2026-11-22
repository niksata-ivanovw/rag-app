import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

/** Where the login page sends the user back to */
export interface FromState {
  from?: string;
}

/** Pages behind login: without a token, go to /login and come back here afterwards */
export const RequireAuth: React.FC = () => {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) {
    const state: FromState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
};

/** /login and /register: a logged-in user goes straight to the app */
export const PublicOnly: React.FC = () => {
  const { token } = useAuth();
  const location = useLocation();
  if (token) {
    const from = (location.state as FromState | null)?.from;
    return <Navigate to={from && from !== '/login' && from !== '/register' ? from : '/chat'} replace />;
  }
  return <Outlet />;
};
