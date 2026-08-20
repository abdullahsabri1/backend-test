const express = require("express");
const router = express.Router();
const upload = require("../../middleware/uploadMiddleware");

const {
  getBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
  downloadBook,
} = require("../../controllers/v1/bookController");
const { protect, authorize } = require("../../middleware/authMiddleware");

router.use(protect);

router.get("/", authorize("admin", "user"), getBooks);
router.get("/all", authorize("admin", "user"), getBooks);

router.get("/:id", authorize("user", "admin"), getBookById);
router.get("/:id/download", authorize("user", "admin"), downloadBook);

router.post("/", authorize("user"), upload.single("file"), createBook);
router.put("/:id", authorize("user"), updateBook);
router.delete("/:id", authorize("user", "admin"), deleteBook);

module.exports = router;
