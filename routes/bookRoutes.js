const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");

const {
  getAllBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
  downloadBook,
  getBooksByNameOrAuthor,
} = require("../controllers/bookController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/", authorize("admin", "user"), getAllBooks);
router.get("/search", authorize("admin", "user"), getBooksByNameOrAuthor);
router.get("/:id", authorize("user", "admin"), getBookById);

router.post("/", authorize("user"), upload.single("file"), createBook);

router.put("/:id", authorize("user"), updateBook);
router.delete("/:id", authorize("user", "admin"), deleteBook);
router.get("/:id/download", authorize("user", "admin"), downloadBook);
module.exports = router;
