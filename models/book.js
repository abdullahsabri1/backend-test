const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      index: true,
    },
    author: {
      type: String,
      required: [true, "Author is required"],
      trim: true,
    },
    isbn: {
      type: String,
      required: [true, "ISBN is required"],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "No description provided.",
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: [
        "Fiction",
        "Non-Fiction",
        "Education",
        "Technology",
        "Science",
        "History",
        "Biography",
        "Self-Help",
      ],
      index: true,
    },
    filePath: { type: String },
    fileName: { type: String },
    originalName: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String },
    tags: [{ type: String, trim: true }],
    publishedDate: {
      type: Date,
      default: Date.now,
    },
    publisher: {
      type: String,
      trim: true,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator User ID is required"],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Book || mongoose.model("Book", bookSchema);
