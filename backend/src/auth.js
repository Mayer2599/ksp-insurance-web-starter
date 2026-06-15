import jwt from 'jsonwebtoken';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token tidak ditemukan.' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Sesi tidak valid atau kedaluwarsa.' });
  }
}

export function requireCorporate(req, res, next) {
  if (req.user?.role !== 'CORPORATE') {
    return res.status(403).json({ message: 'Akses hanya untuk Corporate.' });
  }
  next();
}
