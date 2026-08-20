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
  getBookAnalytics,
} = require("../../controllers/v2/bookController");
const { protect, authorize } = require("../../middleware/authMiddleware");

router.use(protect);

router.get("/analytics", authorize("admin", "user"), getBookAnalytics);

router.get("/", authorize("admin", "user"), getBooks);
router.post("/", authorize("user", "admin"), upload.single("file"), createBook);

router.get("/:id/download", authorize("user", "admin"), downloadBook);

router.get("/:id", authorize("user", "admin"), getBookById);
router.put(
  "/:id",
  authorize("user", "admin"),
  upload.single("file"),
  updateBook,
);
router.delete("/:id", authorize("user", "admin"), deleteBook);

module.exports = router;
