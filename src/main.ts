import { parseFile } from "music-metadata";
import { readdir, rename } from "node:fs/promises";
import { join as joinPath, extname, basename, dirname } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    directory: {
      type: "string",
      short: "d",
    },
    help: {
      type: "boolean",
      short: "h",
    },
    recursive: {
      type: "boolean",
      short: "r",
    },
  },
});

const executableName = basename(process.argv[1]!);

function help() {
  console.log(`Usage: ${executableName} --directory <path>

Options:
  --directory, -d   Path to the directory containing audio files
  --recursive, -r   Process files in subdirectories recursively
  --help, -h        Show this help message`);
}

if (values.help) {
  help();
  process.exit(0);
}

const dirPath = values.directory;

if (!dirPath) {
  help();
  process.exit(1);
}

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

const allFiles = await readdir(dirPath, {
  withFileTypes: true,
  recursive: values.recursive ?? false,
});
const files = allFiles
  .filter(
    (file) => file.isFile() && audioFileExtensions.has(extname(file.name)),
  )
  .map((file) => joinPath(file.parentPath, file.name));

const MIN_PADDING_SIZE = 2;
const TRACK_NUMBER_SEPARATOR = ". ";
const DISK_NUMBER_SEPARATOR = ".";

function getPaddingSize(totalFiles: number): number {
  return Math.max(
    Math.ceil(Math.log(totalFiles + 1) / Math.log(10)),
    MIN_PADDING_SIZE,
  );
}

const filesWithMetadata = await Promise.all(
  files.map(async (file) => {
    const data = await parseFile(file);

    return {
      file,
      album: data.common.album,
      trackNumber: data.common.track.no,
      title: data.common.title,
      diskNumber:
        data.common.disk.no && data.common.disk.of
          ? data.common.disk.no
          : undefined,
    };
  }),
);

const albumsWithMaxTrackNumber = new Map<string, number>();
for (const { album, trackNumber } of filesWithMetadata) {
  if (!album || trackNumber == null) {
    continue;
  }

  const currentMax = albumsWithMaxTrackNumber.get(album) ?? 0;
  if (trackNumber > currentMax) {
    albumsWithMaxTrackNumber.set(album, trackNumber);
  }
}

for (const file of filesWithMetadata) {
  const { title, trackNumber, album, diskNumber } = file;

  if (!title) {
    console.warn(`Skipping file (missing title or track number): ${file}`);
    continue;
  }

  const paddingSize = getPaddingSize(
    (album ? albumsWithMaxTrackNumber.get(album) : 0) ?? 0,
  );

  const replacedTitle = replacements
    .entries()
    .reduce(
      (acc, [target, replacement]) => acc.replaceAll(target, replacement),
      title.trim(),
    );

  const paddedTrackNumber =
    trackNumber != null
      ? String(trackNumber).padStart(paddingSize, "0") + TRACK_NUMBER_SEPARATOR
      : "";

  const paddedDiskNumber =
    diskNumber != null ? String(diskNumber) + DISK_NUMBER_SEPARATOR : "";

  const extension = extname(file.file);

  await rename(
    file.file,
    joinPath(
      dirname(file.file),
      `${paddedDiskNumber}${paddedTrackNumber}${replacedTitle}${extension}`,
    ),
  );
}
