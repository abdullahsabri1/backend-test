const User = require("../models/user");
const jwt = require("jsonwebtoken");

const ACCESS_SECRET = process.env.JWT_SECRET || "fallback_super_secret_key";
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "fallback_refresh_super_secret_key";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : "";

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Invalid email format. Please provide a valid email address.",
      });
    }

    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (@$!%*?&).",
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered" });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: role || "user",
    });

    return res.status(201).json({
      message: "User created successfully",
      userId: user._id,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Server error during registration",
      error: err.message,
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : "";

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      ACCESS_SECRET,
      { expiresIn: "15m" },
    );

    const refreshToken = jwt.sign({ id: user._id }, REFRESH_SECRET, {
      expiresIn: "7d",
    });

    if (!user.refreshTokens) {
      user.refreshTokens = [];
    }
    user.refreshTokens.push(refreshToken);
    await user.save();

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: "Server error during login",
      error: err.message,
    });
  }
};

const refreshTokenHandler = async (req, res) => {
  try {
    const oldRefreshToken = req.cookies?.refreshToken;

    if (!oldRefreshToken) {
      return res
        .status(401)
        .json({ message: "Refresh token required in cookies" });
    }

    const decoded = jwt.verify(oldRefreshToken, REFRESH_SECRET);

    const user = await User.findById(decoded.id);

    if (
      !user ||
      !user.refreshTokens ||
      !user.refreshTokens.includes(oldRefreshToken)
    ) {
      return res
        .status(403)
        .json({ message: "Invalid or revoked refresh token" });
    }

    user.refreshTokens = user.refreshTokens.filter(
      (token) => token !== oldRefreshToken,
    );

    const newAccessToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      ACCESS_SECRET,
      { expiresIn: "15m" },
    );

    const newRefreshToken = jwt.sign({ id: user._id }, REFRESH_SECRET, {
      expiresIn: "7d",
    });

    user.refreshTokens.push(newRefreshToken);
    await user.save();

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
    });
  } catch (err) {
    return res.status(403).json({
      message: "Expired or invalid refresh token",
      error: err.message,
    });
  }
};

const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      const user = await User.findOne({ refreshTokens: refreshToken });
      if (user) {
        user.refreshTokens = user.refreshTokens.filter(
          (token) => token !== refreshToken,
        );
        await user.save();
      }
    }

    res.clearCookie("refreshToken");
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error during logout", error: err.message });
  }
};

module.exports = {
  register,
  login,
  refreshTokenHandler,
  logout,
};
