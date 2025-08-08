// ogr2ogrExportService.js
const express   = require("express"),
      multer    = require("multer"),
      { execFile } = require("child_process"),
      fs        = require("fs"),
      archiver  = require("archiver"),
      upload    = multer();

const app = express();
const cors = require('cors');
app.use(cors({
  origin: 'http://localhost:3000' //Restrict URL's here
}));

// turn your incoming GeoJSON into a Shapefile + UTF-8 DBF, then zip it
app.post("/convert", upload.single("geojson"), (req, res) => {
  const geojson = req.file.buffer.toString("utf8");
  fs.writeFileSync("in.geojson", geojson);

  execFile('ogr2ogr', [
  '-f', 'ESRI Shapefile', 'out', 'in.geojson', '-lco', 'ENCODING=UTF-8'
], (err, stdout, stderr) => {
  if (err) {
    console.error("ogr2ogr error:", stderr); // <-- this is the key
    return res.status(500).send(stderr || err.message);
  }
    // zip the `out` folder on the fly
    res.attachment("export.zip");
    const archive = archiver("zip");
    archive.directory("out/", false);
    archive.pipe(res);
    archive.finalize();
  });
});

app.listen(3002, () => console.log("ogr2ogr service listening on :3002"));
