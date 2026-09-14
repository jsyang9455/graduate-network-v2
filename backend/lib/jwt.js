const jwt = require('jsonwebtoken');
const { canonicalRole } = require('./roles');

function signUserToken(user) {
  const role = canonicalRole(user);
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type,
      role,
      school_id: user.school_id ?? null,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

function publicUser(user) {
  if (!user) return null;
  const {
    password_hash,
    ...rest
  } = user;
  return {
    ...rest,
    role: canonicalRole(user),
    school_id: user.school_id ?? null,
  };
}

module.exports = { signUserToken, publicUser };
