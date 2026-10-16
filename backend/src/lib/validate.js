/** Roles a visitor may choose at signup. `admin` is deliberately absent. */
export const ROLES = ['student', 'parent', 'faculty'];

export const ADMIN_ROLE = 'admin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup({ name, email, password, role }) {
  const errors = {};

  if (typeof name !== 'string' || name.trim().length < 2) {
    errors.name = 'Enter your full name (at least 2 characters)';
  } else if (name.trim().length > 80) {
    errors.name = 'Name must be 80 characters or fewer';
  }

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address';
  }

  if (typeof password !== 'string' || password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must include at least one letter and one number';
  }

  if (role !== undefined && !ROLES.includes(role)) {
    errors.role = `Role must be one of: ${ROLES.join(', ')}`;
  }

  return errors;
}

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
