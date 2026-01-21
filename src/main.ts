import { parseFile } from "music-metadata";
import { readdir, rename } from "node:fs/promises";
import { join as joinPath, basename, dirname } from "node:path";
import { parseArgs } from "node:util";
import { fileTypeFromFile } from "file-type";

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

const allFiles = await readdir(dirPath, {
  withFileTypes: true,
  recursive: values.recursive ?? false,
});
const files = allFiles
  .filter((file) => file.isFile())
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
    const type = await fileTypeFromFile(file);

    if (type?.mime.startsWith("audio/") !== true) {
      return undefined;
    }

    return {
      file,
      album: data.common.album,
      trackNumber: data.common.track.no,
      trackAmount: data.common.track.of,
      title: data.common.title,
      diskNumber: data.common.disk.no,
      diskAmount: data.common.disk.of,
      type,
    };
  }),
);

const albumsWithMaxTrackAndDiskNumber = new Map<
  string,
  { track: number; disk: number }
>();
for (const file of filesWithMetadata) {
  if (!file?.album) {
    continue;
  }

  const currentMax = albumsWithMaxTrackAndDiskNumber.get(file.album) ?? {
    track: 0,
    disk: 0,
  };

  albumsWithMaxTrackAndDiskNumber.set(file.album, {
    track: Math.max(
      currentMax.track ?? 0,
      file.trackAmount ?? 0,
      file.trackNumber ?? 0,
    ),
    disk: Math.max(
      currentMax.disk ?? 0,
      file.diskAmount ?? 0,
      file.diskNumber ?? 0,
    ),
  });
}

for (const file of filesWithMetadata) {
  if (!file) {
    continue;
  }

  const { title, trackNumber, album, diskNumber } = file;

  if (!title) {
    console.warn(`Skipping file (missing title or track number): ${file}`);
    continue;
  }

  const { track: albumTrackNumber, disk: albumDiskNumber } =
    albumsWithMaxTrackAndDiskNumber.get(album ?? "") ?? { track: 0, disk: 0 };

  const paddingSize = getPaddingSize(
    (album ? albumsWithMaxTrackAndDiskNumber.get(album)?.track : 0) ?? 0,
  );

  const replacedTitle = replacements
    .entries()
    .reduce(
      (acc, [target, replacement]) => acc.replaceAll(target, replacement),
      title.trim(),
    );

  const paddedTrackNumber =
    trackNumber != null && albumTrackNumber > 1
      ? String(trackNumber).padStart(paddingSize, "0") + TRACK_NUMBER_SEPARATOR
      : "";

  const paddedDiskNumber =
    diskNumber != null && albumDiskNumber > 1
      ? String(diskNumber) + DISK_NUMBER_SEPARATOR
      : "";

  const extension = `.${file.type.ext}`;

  await rename(
    file.file,
    joinPath(
      dirname(file.file),
      `${paddedDiskNumber}${paddedTrackNumber}${replacedTitle}${extension}`,
    ),
  );
}
