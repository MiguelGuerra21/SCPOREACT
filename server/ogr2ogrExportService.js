import express from "express";
import multer from "multer";
import { execFile } from "child_process";
import { writeFileSync, existsSync, rmSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const upload = multer();
const app = express();
app.use(cors({ origin: "http://localhost:3000" }));

app.post("/convert", upload.single("geojson"), async (req, res) => {
  try {
    const id = uuidv4();
    const tmpDir = path.join(os.tmpdir(), `ogr_export_${id}`);
    mkdirSync(tmpDir);
    const inFile = path.join(tmpDir, "in.geojson");
    const outDir = path.join(tmpDir, "out");

    // Save file
    const geojsonStr = req.file.buffer.toString("utf8");
    writeFileSync(inFile, geojsonStr, "utf8");

    const ogrPath = "C:\\OSGeo4W\\bin\\ogr2ogr.exe"; 
    const args = ['-f', 'ESRI Shapefile', outDir, inFile, '-lco', 'ENCODING=UTF-8', '-t_srs', 'EPSG:4326'];

    execFile(ogrPath, args, (err, stdout, stderr) => {
      if (err) {
        console.error("ogr2ogr error:", stderr || err.message);
        // cleanup optional
        return res.status(500).send(stderr || String(err));
      }
      // zip outDir
      res.attachment("export.zip");
      const archive = archiver("zip");
      archive.directory(outDir + "/", false);
      archive.pipe(res);
      archive.finalize();
    });

  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

app.listen(3002, () => console.log("ogr2ogr service listening on :3002"));
