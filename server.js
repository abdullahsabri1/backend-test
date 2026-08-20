const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/bookdb",
    );
    console.log(`Connected to MongoDB : ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

connectDB();

app.use("/api/auth", require("./routes/authRoutes"));

app.use("/api/v1/books", require("./routes/v1/bookRoutes"));
app.use("/api/v2/books", require("./routes/v2/bookRoutes"));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Book Management API is running",
    endpoints: {
      auth: "/api/auth",
      v1_books: "/api/v1/books",
      v2_books: "/api/v2/books",
    },
  });
});

app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found at ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`- Auth Endpoints:     http://localhost:${PORT}/api/auth`);
  console.log(`- v1 Book Endpoints: http://localhost:${PORT}/api/v1/books`);
  console.log(`- v2 Book Endpoints: http://localhost:${PORT}/api/v2/books`);
});
