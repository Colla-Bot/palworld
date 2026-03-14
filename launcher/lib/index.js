const fs = require("fs").promises;
const crypto = require("crypto");
const path = require("path");

async function calculateMD5(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash("md5");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

async function getFilesRecursively(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const subFiles = await getFilesRecursively(fullPath);
      files.push(...subFiles);
    } else {
      const relativePath = path.relative("dist", fullPath).replace(/\\/g, "/");
      if (relativePath === "config.json") {
        continue;
      }
      files.push({
        path: relativePath,
        md5: await calculateMD5(fullPath),
      });
    }
  }

  return files;
}

async function main() {
  try {
    // Check if dist directory exists
    try {
      await fs.access("dist");
    } catch (error) {
      console.error("Error: dist directory does not exist");
      process.exit(1);
    }

    // Get all files and their hashes
    const files = await getFilesRecursively("dist");

    // Sort files by path for consistent output
    files.sort((a, b) => a.path.localeCompare(b.path));

    await fs.writeFile(
      "dist/config.json",
      `${JSON.stringify(
        {
          mumbleUrl: "...",
          files,
        },
        null,
        2
      )}\n`
    );
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
