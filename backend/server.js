
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN ||
  "http://127.0.0.1:5500,http://localhost:5500"
)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  }
}));

app.use(express.json({ limit: "10kb" }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;

const OWM_BASE = "https://api.openweathermap.org/data/2.5";

app.get("/", (req, res) => {
  res.type("text").send("The Daily Climate backend is running.");
});

async function getOpenWeather(endpoint, req, res) {
  const city = String(req.query.city || "").trim();
  const units = String(req.query.units || "metric").trim();

  if (!city) {
    return res.status(400).json({ error: "Please provide a city." });
  }

  if (city.length > 80) {
    return res.status(400).json({ error: "City name is too long." });
  }

  if (!["standard", "metric", "imperial"].includes(units)) {
    return res.status(400).json({ error: "Invalid temperature unit." });
  }

  if (!OPENWEATHER_API_KEY) {
    return res.status(503).json({
      error: "Weather API key is not configured on the server."
    });
  }

  try {
    const url = new URL(`${OWM_BASE}/${endpoint}`);
    url.searchParams.set("q", city);
    url.searchParams.set("units", units);
    url.searchParams.set("appid", OPENWEATHER_API_KEY);

    const upstream = await fetch(url);
    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status === 401 ? 502 : upstream.status).json({
        error: upstream.status === 404
          ? `Could not find "${city}".`
          : upstream.status === 401
            ? "Weather provider rejected the API key."
            : data.message || "Weather request failed."
      });
    }

    return res.json(data);
  } catch (error) {
    console.error("Weather API error:", error.message);
    return res.status(502).json({
      error: "Could not reach the weather provider."
    });
  }
}

app.get("/api/weather", (req, res) =>
  getOpenWeather("weather", req, res)
);

app.get("/api/forecast", (req, res) =>
  getOpenWeather("forecast", req, res)
);

app.get("/api/news", async (req, res) => {
  const query = String(req.query.q || "weather").trim().slice(0, 100);

  if (!NEWSDATA_API_KEY) {
    return res.status(503).json({
      error: "News API key is not configured on the server."
    });
  }

  try {
    const url = new URL("https://newsdata.io/api/1/news");

    url.searchParams.set("apikey", NEWSDATA_API_KEY);
    url.searchParams.set("q", query || "weather");
    url.searchParams.set("language", "en");

    const upstream = await fetch(url);
    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data.message || "News provider request failed."
      });
    }

    return res.json(data);

  } catch (error) {
    console.error("News API error:", error.message);
    return res.status(502).json({
      error: "Could not reach the news provider."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`The Daily Climate backend is running on port ${PORT}`);
});
