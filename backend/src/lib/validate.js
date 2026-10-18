/**
 * Sign-in validation. There is no local signup to validate: accounts are created with
 * Google, so the only credential this app checks is an existing email and password.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLogin({ email, password }) {
  const errors = {};

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address';
  }

  if (typeof password !== 'string' || password.length === 0) {
    errors.password = 'Enter your password';
  }

  return errors;
}

