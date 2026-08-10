const jwt = require("jsonwebtoken");

const ACCESS_SECRET = process.env.JWT_SECRET || "fallback_super_secret_key";

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, ACCESS_SECRET);

      const userId = decoded.id || decoded._id;

      if (!userId) {
        return res
          .status(401)
          .json({ message: "Not authorized, invalid token structure" });
      }

      req.user = {
        id: userId,
        _id: userId,
        email: decoded.email,
        role: decoded.role,
      };

      return next();
    } catch (error) {
      return res.status(401).json({
        message: "Not authorized, token failed or expired",
        error: error.message,
      });
    }
  }

  if (!token) {
    return res
      .status(401)
      .json({ message: "Not authorized, no token provided" });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `User role '${req.user?.role || "unknown"}' is not authorized to access this route`,
      });
    }
    next();
  };
};

module.exports = {
  protect,
  authorize,
};
