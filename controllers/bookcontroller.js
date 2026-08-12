const Book = require("../models/Book");
const path = require("path");
const Fuse = require("fuse.js");

const getAllBooks = async (req, res) => {
  try {
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const skipNum = (pageNum - 1) * limitNum;

    let query = {};

    if (req.user?.role !== "admin" && req.user?._id) {
      query.createdBy = req.user._id;
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.query.author) {
      query.author = { $regex: req.query.author.trim(), $options: "i" };
    }

    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { author: { $regex: req.query.search, $options: "i" } },
      ];
    }

    const books = await Book.find(query)
      .populate("createdBy", "name email")
      .limit(limitNum)
      .skip(skipNum)
      .sort({ createdAt: -1 });

    const total = await Book.countDocuments(query);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      count: books.length,
      data: books,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const getBookById = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate(
      "createdBy",
      "name email",
    );
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    const createdById = book.createdBy?._id
      ? book.createdBy._id.toString()
      : book.createdBy?.toString();

    const isOwner = createdById === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (isAdmin || isOwner) {
      return res.status(200).json(book);
    }

    const available = book.isAvailable !== undefined ? book.isAvailable : true;
    const isBookAvailable =
      available && (book.stock === undefined || book.stock > 0);
    x``;
    return res.status(200).json({
      bookId: book._id,
      title: book.title,
      isAvailable: isBookAvailable,
      status: isBookAvailable ? "Available" : "Not Available",
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const createBook = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Please upload a book file (.pdf, .epub, etc.)",
      });
    }

    if (req.user && req.user.role === "admin") {
      return res.status(403).json({
        message: "Forbidden: Admins are not allowed to upload books.",
      });
    }

    if (req.body.isbn) {
      const existingBook = await Book.findOne({ isbn: req.body.isbn });
      if (existingBook) {
        return res
          .status(400)
          .json({ message: "Book with this ISBN already exists" });
      }
    }

    const book = await Book.create({
      ...req.body,
      filePath: req.file.path,
      fileName: req.file.filename,
      filePath: req.file.path,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      message: "Book uploaded and created successfully",
      book,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};
const updateBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    const createdById = book.createdBy?._id
      ? book.createdBy._id.toString()
      : book.createdBy?.toString();

    const isOwner = createdById === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Forbidden: You can only update your own books" });
    }

    const updatedBook = await Book.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    return res
      .status(200)
      .json({ message: "Book updated successfully", book: updatedBook });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const deleteBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    const createdById = book.createdBy?._id
      ? book.createdBy._id.toString()
      : book.createdBy?.toString();

    const isOwner = createdById === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Forbidden: You can only delete your own books" });
    }

    await Book.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: "Book deleted successfully" });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const downloadBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    if (!book.filePath) {
      return res
        .status(404)
        .json({ message: "No file uploaded for this book" });
    }

    const absoluteFilePath = path.resolve(book.filePath);

    return res.download(absoluteFilePath, book.originalName || book.fileName);
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

const getBooks = async (req, res) => {
  try {
    const { page, limit, sort, order, search, ...filters } = req.query;

    let mongoQuery = {};

    if (search && String(search).trim() !== "") {
      const searchRegex = { $regex: String(search).trim(), $options: "i" };
      mongoQuery.$or = [
        { title: searchRegex },
        { author: searchRegex },
        { description: searchRegex },
        { publisher: searchRegex },
        { originalName: searchRegex },
        { isbn: searchRegex },
      ];
    }

    Object.keys(filters).forEach((key) => {
      let value = filters[key];

      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      ) {
        return;
      }

      const rangeMatch = key.match(/^(\w+)\[(gte|gt|lte|lt)\]$/);
      if (rangeMatch) {
        const [, field, op] = rangeMatch;
        const numVal = !isNaN(value) ? Number(value) : value;
        mongoQuery[field] = mongoQuery[field] || {};
        mongoQuery[field][`$${op}`] = numVal;
        return;
      }

      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        let rangeObj = {};
        Object.keys(value).forEach((op) => {
          if (["gte", "gt", "lte", "lt"].includes(op)) {
            const rawVal = value[op];
            rangeObj[`$${op}`] = !isNaN(rawVal) ? Number(rawVal) : rawVal;
          }
        });
        if (Object.keys(rangeObj).length > 0) {
          mongoQuery[key] = { ...mongoQuery[key], ...rangeObj };
        }
        return;
      }

      if (typeof value === "string" && value.includes(",")) {
        const list = value.split(",").map((item) => item.trim());
        mongoQuery[key] = { $in: list };
        return;
      }

      if (value === "true" || value === "false") {
        mongoQuery[key] = value === "true";
        return;
      }

      if (
        !isNaN(value) &&
        typeof value !== "boolean" &&
        String(value).trim() !== "" &&
        key !== "isbn"
      ) {
        mongoQuery[key] = Number(value);
        return;
      }

      if (typeof value === "string") {
        mongoQuery[key] = { $regex: value.trim(), $options: "i" };
      }
    });

    let sortBy = "-createdAt";
    if (sort) {
      const sortOrder = order === "asc" ? "" : "-";
      sortBy = `${sortOrder}${sort}`;
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const books = await Book.find(mongoQuery)
      .populate("createdBy", "name email")
      .sort(sortBy)
      .skip(skip)
      .limit(limitNum);

    const total = await Book.countDocuments(mongoQuery);

    return res.status(200).json({
      success: true,
      count: books.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      queryExecuted: mongoQuery,
      data: books,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getAllBooks,
  getBookById,

  getBooks,
  createBook,
  updateBook,
  deleteBook,
  downloadBook,
};
