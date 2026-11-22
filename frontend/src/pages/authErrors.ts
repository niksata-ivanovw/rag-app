import axios from 'axios';

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt on the backend only uses the first 72 bytes
export const MAX_PASSWORD_BYTES = 72;

/** Problem with a new password, or null if it is acceptable (same rules as the backend) */
export const passwordProblem = (password: string): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH) return `Паролата трябва да е поне ${MIN_PASSWORD_LENGTH} символа.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return 'Паролата е твърде дълга (до 72 байта – около 36 символа на кирилица).';
  }
  return null;
};

/** Bulgarian message for a failed POST /auth/login or /auth/register */
export const authErrorMessage = (err: unknown, action: 'login' | 'register'): string => {
  if (!axios.isAxiosError(err)) return 'Възникна неочаквана грешка. Опитайте отново.';
  if (!err.response) return 'Няма връзка със сървъра. Проверете дали backend-ът работи.';

  const { status, data } = err.response;
  if (status === 401 && action === 'login') return 'Грешен имейл или парола.';
  if (status === 409) return 'Вече има акаунт с този имейл. Влезте в него или използвайте друг имейл.';
  if (status === 422) {
    // FastAPI validation errors: [{loc: ['body', 'email'], msg: ...}, ...]
    const fields: string[] = Array.isArray(data?.detail)
      ? data.detail.map((d: { loc?: unknown[] }) => String(d.loc?.[d.loc.length - 1] ?? ''))
      : [];
    if (fields.includes('email') || fields.includes('username')) return 'Невалиден имейл адрес.';
    if (fields.includes('password')) {
      return `Паролата трябва да е между ${MIN_PASSWORD_LENGTH} символа и ${MAX_PASSWORD_BYTES} байта.`;
    }
    return 'Невалидни данни.';
  }
  return 'Сървърът върна грешка. Опитайте отново по-късно.';
};
