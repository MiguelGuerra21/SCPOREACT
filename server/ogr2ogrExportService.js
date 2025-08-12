// server/ogr2ogrExportService.js
import express from "express";
import multer from "multer";
import { execFile } from "child_process";
import fs ,{ writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const upload = multer();
const app = express();

// DEV: permitir cualquier origen (más fácil para pruebas). En producción restringe.
app.use(cors({ origin: true }));
app.use(express.json({ limit: "500mb" }));

const OGR2OGR_PATH = "C:\\OSGeo4W\\bin\\ogr2ogr.exe"; // ajusta según tu entorno
const PORT = 3002;

app.post("/convert", upload.single("geojson"), async (req, res) => {
  const id = uuidv4();
  const tmpDir = path.join(os.tmpdir(), `ogr_export_${id}`);
  const inFile = path.join(tmpDir, "in.geojson");
  const outDir = path.join(tmpDir, "out");
  try {
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });

    let geojsonStr = null;
    if (req.file && req.file.buffer) {
      geojsonStr = req.file.buffer.toString("utf8");
    } else if (req.body && req.body.geojson) {
      geojsonStr = typeof req.body.geojson === "string"
        ? req.body.geojson
        : JSON.stringify(req.body.geojson);
    } else {
      return res.status(400).json({ error: "No geojson provided" });
    }

    writeFileSync(inFile, geojsonStr, "utf8");

    const args = ['-f', 'ESRI Shapefile', outDir, inFile, '-lco', 'ENCODING=UTF-8', '-t_srs', 'EPSG:4326'];
    console.log("Running ogr2ogr:", OGR2OGR_PATH, args.join(" "));

    await new Promise((resolve, reject) => {
      execFile(OGR2OGR_PATH, args, (err, stdout, stderr) => {
        console.log("ogr2ogr stdout:", stdout);
        if (err) {
          console.error("ogr2ogr stderr:", stderr);
          return reject(new Error(stderr || err.message));
        }
        resolve();
      });
    });

    // Zip the output directory using fs (no require)
    const zipPath = path.join(tmpDir, "export.zip");
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip");
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(outDir + "/", false);
      archive.finalize();
    });

    // decide response type
    const acceptJson = (req.headers["accept"] || "").includes("application/json") || req.is("application/json");
    if (acceptJson) {
      const zipBuf = readFileSync(zipPath);
      const b64 = zipBuf.toString("base64");
      res.json({ filename: "export.zip", data: b64 });
    } else {
      res.attachment("export.zip");
      const stream = fs.createReadStream(zipPath);
      stream.pipe(res);
    }

  } catch (err) {
    console.error("convert error:", err);
    res.status(500).json({ error: String(err.message || err) });
  } finally {
    if (process.env.NODE_ENV === "production") {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    } else {
      console.log("Temp dir left for inspection:", tmpDir);
    }
  }
});

// IMPORTANT: bind to 0.0.0.0 so emulator / devices can reach it on LAN
app.listen(PORT, "0.0.0.0", () => console.log(`ogr2ogr service listening on :${PORT}`));
