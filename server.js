const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const bookRoutes = require("./routes/bookRoutes");

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);

app.get("/", (req, res) => {
  res.status(200).json({ message: "Book Management API is running clean!" });
});

const PORT = process.env.PORT || 3000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/myCrudApp";

if (process.env.NODE_ENV !== "test") {
  mongoose
    .connect(MONGO_URI)
    .then(() => {
      console.log("Connected to MongoDB successfully");
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Database connection failed:", err.message);
      process.exit(1);
    });
}

module.exports = app;
