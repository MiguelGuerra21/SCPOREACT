import express from "express";
import fs from "fs";
import path from "path";

const LOG_PATH = "C:/temp/SCPOLogs.txt";

// ensure folder exists
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

const app = express();
app.use(express.json());
app.get("/api/ping", (_req, res) => res.sendStatus(204));

app.post("/api/log", (req, res) => {
  const { message } = req.body;
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFile(LOG_PATH, line, err => {
    if (err) {
      console.error("Failed writing log:", err);
      return res.status(500).send("log error");
    }
    res.sendStatus(204);
  });
});

app.listen(3001, () => console.log("Logger listening on :3001"));
