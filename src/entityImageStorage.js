const fileStorage = require("./fileStorage");

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function processEntityImageForStorage(imageValue, folder, entityId) {
  if (imageValue == null || imageValue === "") return null;
  if (fileStorage.isFilePath(imageValue)) return imageValue;
  if (!isDataUrl(imageValue)) {
    const error = new Error("Invalid entity image payload");
    error.status = 400;
    throw error;
  }
  return fileStorage.processForStorage(imageValue, folder, entityId, "", 0, true);
}

function deleteEntityImageFile(imageValue) {
  if (imageValue) {
    fileStorage.deleteAttachment(imageValue);
  }
}

function resolveEntityImageUpdate(oldImage, newImage, folder, entityId) {
  if (newImage === undefined) return undefined;
  if (newImage == null || newImage === "") {
    deleteEntityImageFile(oldImage);
    return null;
  }
  if (fileStorage.isFilePath(newImage)) {
    if (newImage !== oldImage) {
      deleteEntityImageFile(oldImage);
    }
    return newImage;
  }
  deleteEntityImageFile(oldImage);
  return processEntityImageForStorage(newImage, folder, entityId);
}

module.exports = {
  processEntityImageForStorage,
  deleteEntityImageFile,
  resolveEntityImageUpdate,
};
