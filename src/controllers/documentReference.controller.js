const {
  getAllReferencesHandler,
  getReferenceByIdHandler,
  createReferenceHandler,
  updateReferenceHandler,
  deleteReferenceHandler,
} = require("../handlers");

const documentReferenceController = {
  getAll: getAllReferencesHandler,
  getById: getReferenceByIdHandler,
  create: createReferenceHandler,
  update: updateReferenceHandler,
  delete: deleteReferenceHandler,
};

module.exports = documentReferenceController;
