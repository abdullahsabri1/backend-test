const path = require("path");
const fs = require("fs");
const Book = require("../../models/Book");
const mongoose = require("mongoose");
const SAFE_UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

const getBooks = async (req, res) => {
  try {
    const {
      page,
      limit,
      sort,
      order,
      search,
      category,
      minPrice,
      maxPrice,
      minPages,
      maxPages,
      ...filters
    } = req.query;

    const andConditions = [];

    if (req.user && req.user.role !== "admin" && req.user._id) {
      andConditions.push({
        createdBy: new mongoose.Types.ObjectId(req.user._id),
      });
    }

    if (search && String(search).trim() !== "") {
      const searchRegex = { $regex: String(search).trim(), $options: "i" };
      andConditions.push({
        $or: [
          { title: searchRegex },
          { author: searchRegex },
          { description: searchRegex },
          { publisher: searchRegex },
          { originalName: searchRegex },
          { isbn: searchRegex },
          { category: searchRegex },
        ],
      });
    }

    if (category && String(category).trim() !== "") {
      if (category.includes(",")) {
        const list = category
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        andConditions.push({ category: { $in: list } });
      } else {
        andConditions.push({
          category: { $regex: `^${category.trim()}$`, $options: "i" },
        });
      }
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter = {};
      if (minPrice !== undefined && minPrice !== "")
        priceFilter.$gte = Number(minPrice);
      if (maxPrice !== undefined && maxPrice !== "")
        priceFilter.$lte = Number(maxPrice);
      if (Object.keys(priceFilter).length > 0)
        andConditions.push({ price: priceFilter });
    }

    if (minPages !== undefined || maxPages !== undefined) {
      const pagesFilter = {};
      if (minPages !== undefined && minPages !== "")
        pagesFilter.$gte = Number(minPages);
      if (maxPages !== undefined && maxPages !== "")
        pagesFilter.$lte = Number(maxPages);
      if (Object.keys(pagesFilter).length > 0)
        andConditions.push({ pages: pagesFilter });
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

      if (
        typeof value === "object" &&
        !Array.isArray(value) &&
        value !== null
      ) {
        const rangeObj = {};
        Object.keys(value).forEach((op) => {
          if (["gte", "gt", "lte", "lt"].includes(op)) {
            const rawVal = value[op];
            rangeObj[`$${op}`] = !isNaN(rawVal) ? Number(rawVal) : rawVal;
          }
        });
        if (Object.keys(rangeObj).length > 0) {
          andConditions.push({ [key]: rangeObj });
        }
        return;
      }

      const rangeMatch = key.match(/^(\w+)\[(gte|gt|lte|lt)\]$/);
      if (rangeMatch) {
        const [, field, op] = rangeMatch;
        andConditions.push({
          [field]: { [`$${op}`]: !isNaN(value) ? Number(value) : value },
        });
        return;
      }

      if (value === "true" || value === "false") {
        andConditions.push({ [key]: value === "true" });
        return;
      }

      if (!isNaN(value) && typeof value !== "boolean" && key !== "isbn") {
        andConditions.push({ [key]: Number(value) });
        return;
      }

      if (typeof value === "string") {
        andConditions.push({ [key]: { $regex: value.trim(), $options: "i" } });
      }
    });

    const finalMongoQuery =
      andConditions.length > 0 ? { $and: andConditions } : {};

    const sortField = sort || "createdAt";
    const sortDirection = order === "asc" ? 1 : -1;
    const sortStage = { [sortField]: sortDirection };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const pipeline = [
      { $match: finalMongoQuery },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: sortStage },
            { $skip: skip },
            { $limit: limitNum },
            {
              $lookup: {
                from: "users",
                localField: "createdBy",
                foreignField: "_id",
                as: "creatorInfo",
              },
            },
            {
              $addFields: {
                createdBy: {
                  $let: {
                    vars: { creator: { $arrayElemAt: ["$creatorInfo", 0] } },
                    in: {
                      _id: "$$creator._id",
                      name: "$$creator.name",
                      email: "$$creator.email",
                    },
                  },
                },
                downloadUrl: {
                  $concat: [
                    "/api/v2/books/",
                    { $toString: "$_id" },
                    "/download",
                  ],
                },
              },
            },
            {
              $project: {
                filePath: 0,
                creatorInfo: 0,
              },
            },
          ],
        },
      },
    ];

    const [result] = await Book.aggregate(pipeline);

    const total =
      result && result.metadata && result.metadata[0]
        ? result.metadata[0].total
        : 0;
    const books = (result && result.data) || [];
    const totalPages = Math.ceil(total / limitNum) || 1;

    return res.status(200).json({
      success: true,
      count: books.length,
      total,
      page: pageNum,
      pages: totalPages,
      queryExecuted: finalMongoQuery,
      data: books,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

const getBookById = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).lean();

    if (!book) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }

    const { filePath, ...cleanBook } = book;

    return res.status(200).json({
      success: true,
      data: {
        ...cleanBook,
        downloadUrl: filePath ? `/api/v2/books/${book._id}/download` : null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createBook = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "A book file is required. Upload it using the 'file' field.",
      });
    }

    const { title, author, category, price, isbn } = req.body;

    const book = await Book.create({
      title,
      author,
      category,
      price,
      isbn,
      filePath: req.file.path,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      createdBy: req.user._id,
    });

    const responseBook = book.toObject();
    delete responseBook.filePath;

    return res.status(201).json({
      success: true,
      data: {
        ...responseBook,
        downloadUrl: `/api/v2/books/${book._id}/download`,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }

    if (
      book.createdBy.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this book",
      });
    }

    const { title, author, category, price } = req.body;

    if (title) book.title = title;
    if (author) book.author = author;
    if (category) book.category = category;
    if (price !== undefined) book.price = price;

    if (req.file) {
      if (book.filePath && fs.existsSync(path.resolve(book.filePath))) {
        fs.unlinkSync(path.resolve(book.filePath));
      }
      book.filePath = req.file.path;
    }

    await book.save();

    const responseBook = book.toObject();
    delete responseBook.filePath;

    return res.status(200).json({
      success: true,
      data: {
        ...responseBook,
        downloadUrl: book.filePath
          ? `/api/v2/books/${book._id}/download`
          : null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).select("+filePath");

    if (!book) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }

    if (
      book.createdBy.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this book",
      });
    }

    if (book.filePath) {
      const absolutePath = path.resolve(book.filePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }

    await book.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Book and associated file deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const downloadBook = async (req, res) => {
  try {
    const { id } = req.params;

    const book = await Book.findById(id).select("+filePath");

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }
    const isOwner = book.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission to download this book",
      });
    }
    if (!book.filePath) {
      return res.status(404).json({
        success: false,
        message: "No document attached to this book",
      });
    }

    const resolvedPath = path.isAbsolute(book.filePath)
      ? path.normalize(book.filePath)
      : path.resolve(process.cwd(), book.filePath);

    if (!resolvedPath.startsWith(SAFE_UPLOAD_DIR)) {
      return res.status(403).json({
        success: false,
        message: "Access to the requested file path is forbidden",
      });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        success: false,
        message: "Requested file no longer exists on storage",
      });
    }

    const ext = path.extname(resolvedPath);
    const safeTitle = (book.title || "book_download")
      .replace(/[^a-zA-Z0-9_\- ]/g, "")
      .trim()
      .replace(/\s+/g, "_");

    const finalDownloadName = `${safeTitle}${ext}`;

    return res.download(resolvedPath, finalDownloadName, (err) => {
      if (err && !res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "Could not complete file download stream",
        });
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getBookAnalytics = async (req, res) => {
  try {
    const analytics = await Book.aggregate([
      {
        $group: {
          _id: "$category",
          totalBooks: { $sum: 1 },
          avgPrice: { $avg: "$price" },
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" },
        },
      },
      {
        $project: {
          _id: 0,
          category: { $ifNull: ["$_id", "Uncategorized"] },
          totalBooks: 1,
          avgPrice: { $round: ["$avgPrice", 2] },
          minPrice: 1,
          maxPrice: 1,
        },
      },
      {
        $sort: { totalBooks: -1 },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
  downloadBook,
  getBookAnalytics,
};
