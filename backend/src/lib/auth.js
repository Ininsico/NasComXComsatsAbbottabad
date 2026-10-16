import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { findUserById, toPublicUser } from './store.js';

const SALT_ROUNDS = 10;

export function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    const user = await findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }

    req.user = toPublicUser(user);
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
}

/** Use after requireAuth to restrict a route to specific roles. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this resource' });
    }

    return next();
  };
}
