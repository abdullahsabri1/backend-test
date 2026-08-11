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

const getBooksByNameOrAuthor = async (req, res) => {
  try {
    const { author, name, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));

    const allBooks = await Book.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const searchTerm = [author, name].filter(Boolean).join(" ").trim();

    let results = allBooks;

    if (searchTerm) {
      const fuseOptions = {
        keys: ["title", "author"],
        threshold: 0.5,
        ignoreLocation: true,
      };

      const fuse = new Fuse(allBooks, fuseOptions);
      const searchResults = fuse.search(searchTerm);

      results = searchResults.map((result) => result.item);
    }

    const total = results.length;
    const paginatedBooks = results.slice(
      (pageNum - 1) * limitNum,
      pageNum * limitNum,
    );

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      count: paginatedBooks.length,
      data: paginatedBooks,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
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

module.exports = {
  getAllBooks,
  getBookById,
  getBooksByNameOrAuthor,
  createBook,
  updateBook,
  deleteBook,
  downloadBook,
};
