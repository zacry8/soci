#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const dataFile = process.env.DATA_FILE || "/data/db.json";
const uploadDir = process.env.UPLOAD_DIR || "/uploads";

const errors = [];
const warnings = [];

const fail = (message) => {
  errors.push(message);
};

const warn = (message) => {
  warnings.push(message);
};

const toFileName = (urlPath = "") => path.basename(String(urlPath).split("?")[0]);

async function readState() {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    fail(`Unable to read or parse DATA_FILE (${dataFile}): ${error.message}`);
    return null;
  }
}

async function readUploadFiles() {
  try {
    const entries = await fs.readdir(uploadDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    fail(`Unable to read UPLOAD_DIR (${uploadDir}): ${error.message}`);
    return [];
  }
}

async function run() {
  const state = await readState();
  const uploadFiles = new Set(await readUploadFiles());
  if (!state) {
    printAndExit();
    return;
  }

  const media = Array.isArray(state.media) ? state.media : [];
  const posts = Array.isArray(state.posts) ? state.posts : [];
  const postById = new Map(posts.map((post) => [post.id, post]));

  const mediaById = new Map();
  for (const record of media) {
    if (!record?.id) {
      warn("Found media record without id");
      continue;
    }
    if (mediaById.has(record.id)) {
      fail(`Duplicate media id found: ${record.id}`);
      continue;
    }
    mediaById.set(record.id, record);
  }

  const referencedMediaIds = new Set();
  for (const post of posts) {
    const ids = Array.isArray(post.mediaIds) ? post.mediaIds : [];
    for (const mediaId of ids) {
      referencedMediaIds.add(mediaId);
      if (!mediaById.has(mediaId)) {
        fail(`Post ${post.id || "unknown"} references missing media id ${mediaId}`);
      }
    }
  }

  const missingUploadFiles = [];
  for (const record of mediaById.values()) {
    const ownerPost = record.postId ? postById.get(record.postId) : null;
    if (!ownerPost) {
      warn(`Media ${record.id} points to missing post ${record.postId || "unknown"}`);
    }

    const fileName = toFileName(record.urlPath);
    if (!fileName || !uploadFiles.has(fileName)) {
      missingUploadFiles.push({ mediaId: record.id, urlPath: record.urlPath || "" });
      continue;
    }

    uploadFiles.delete(fileName);
    if (!referencedMediaIds.has(record.id)) {
      warn(`Media ${record.id} exists in state.media but is not referenced by any post.mediaIds`);
    }
  }

  for (const miss of missingUploadFiles) {
    fail(`Media file missing on disk for mediaId=${miss.mediaId}, urlPath=${miss.urlPath}`);
  }

  for (const orphanFileName of uploadFiles) {
    warn(`Orphan upload file not referenced in DB: ${orphanFileName}`);
  }

  printAndExit({
    posts: posts.length,
    mediaRecords: media.length,
    missingUploadFiles: missingUploadFiles.length,
    orphanUploadFiles: uploadFiles.size,
    warnings: warnings.length,
    errors: errors.length
  });
}

function printAndExit(summary = null) {
  if (summary) console.log("integrity summary:", summary);
  for (const message of warnings) console.warn(`warning: ${message}`);
  for (const message of errors) console.error(`error: ${message}`);
  process.exit(errors.length ? 1 : 0);
}

run();
