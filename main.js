import { parseFile } from "music-metadata";
import { readdir, rename } from "node:fs/promises";
import { join as joinPath, extname } from "node:path";

const dirPath = process.argv.at(-1);

const replacements = new Map([
  [":", "ː"],
  ["<", "﹤"],
  [">", "﹥"],
  ['"', "“"],
  ["/", "⁄"],
  ["\\", "∖"],
  ["|", "⼁"],
  ["?", "？"],
  ["*", "﹡"],
]);

const audioFileExtensions = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".wma",
  ".webm",
]);

const allFiles = await readdir(dirPath);
const files = allFiles.filter((file) => audioFileExtensions.has(extname(file)));

const MIN_PADDING_SIZE = 2;
const TRACK_NUMBER_SEPARATOR = ". ";

const paddingSize = Math.max(
  Math.ceil(Math.log(files.length + 1) / Math.log(10)),
  MIN_PADDING_SIZE
);

for (const file of files) {
  const data = await parseFile(joinPath(dirPath, file));

  const {
    title,
    track: { no: trackNumber },
  } = data.common;

  const replacedTitle = replacements
    .entries()
    .reduce(
      (acc, [target, replacement]) => acc.replaceAll(target, replacement),
      title.trim()
    );

  const paddedTrackNumber = String(trackNumber).padStart(paddingSize, "0");

  const extension = extname(file);

  await rename(
    joinPath(dirPath, file),
    joinPath(
      dirPath,
      `${paddedTrackNumber}${TRACK_NUMBER_SEPARATOR}${replacedTitle}${extension}`
    )
  );
}
