const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.JAMENDO_CLIENT_ID || "709fa152";

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(data));
}

function jamendoRequest(path, callback) {
  const requestURL = `https://api.jamendo.com/v3.0/${path}`;

  https.get(requestURL, (apiRes) => {
    let data = "";

    apiRes.on("data", chunk => {
      data += chunk;
    });

    apiRes.on("end", () => {
      try {
        callback(null, JSON.parse(data));
      } catch (error) {
        callback(error);
      }
    });
  }).on("error", error => {
    callback(error);
  });
}

function searchJamendo(query, callback) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    format: "json",
    limit: "50",
    search: query,
    audioformat: "mp31"
  });

  jamendoRequest(`tracks/?${params.toString()}`, callback);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // BitChord manifest
  if (url.pathname === "/manifest.json") {
    return sendJSON(res, {
      id: "subrata.jamendo",
      name: "Subrata Jamendo",
      version: "1.1.0",
      resources: ["search", "stream"]
    });
  }

  // BitChord search
  if (url.pathname === "/search") {
    const query = (url.searchParams.get("q") || "").trim();

    if (!query) {
      return sendJSON(res, { tracks: [] });
    }

    searchJamendo(query, (error, data) => {
      if (error) {
        return sendJSON(res, {
          error: "Jamendo API error"
        }, 500);
      }

      const tracks = (data.results || [])
        .filter(track => track.audio)
        .map(track => ({
          id: String(track.id),
          title: track.name || "Unknown",
          artist: track.artist_name || "Unknown Artist",
          album: track.album_name || "Jamendo",
          duration: Number(track.duration) || 0,
          artworkURL: track.album_image || track.image || "",
          format: "mp3",
          audioQuality: "HIGH"
        }));

      return sendJSON(res, { tracks });
    });

    return;
  }

  // BitChord stream
  if (url.pathname.startsWith("/stream/")) {
    const id = decodeURIComponent(
      url.pathname.substring("/stream/".length)
    );

    if (!/^\d+$/.test(id)) {
      return sendJSON(res, {
        error: "Invalid track ID"
      }, 400);
    }

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      format: "json",
      id,
      audioformat: "mp31",
      action: "stream"
    });

    jamendoRequest(`tracks/?${params.toString()}`, (error, data) => {
      if (error) {
        return sendJSON(res, {
          error: "Jamendo API error"
        }, 500);
      }

      const track = data.results && data.results[0];

      if (!track || !track.audio) {
        return sendJSON(res, {
          error: "Audio stream not available"
        }, 404);
      }

      return sendJSON(res, {
        url: track.audio,
        format: "mp3",
        quality: "High",
        codec: "mp3",
        container: "mp3",
        manifest: "none",
        encrypted: false
      });
    });

    return;
  }

  return sendJSON(res, {
    error: "Not found"
  }, 404);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Subrata Jamendo BitChord addon running on port ${PORT}`);
});
