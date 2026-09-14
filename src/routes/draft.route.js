const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const {
  getDrafts,
  createDraft,
  updateDraft,
  deleteDraft
} = require("../handlers/draft/draft.handler");

router.use(verifyToken);

router.get("/", getDrafts);
router.post("/", createDraft);
router.put("/:id", updateDraft);
router.delete("/:id", deleteDraft);

module.exports = router;
