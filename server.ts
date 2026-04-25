import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";

const hostname: string = "localhost";
const port: number = 3000;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const startServer = async () => {
  await app.prepare();
  console.log("App is ready");

  // 1. Define the HTTP Server
  const httpServer = createServer(async (req, res) => {
    try {
      const parseUrl = parse(req.url!, true);
      await handle(req, res, parseUrl);
    } catch (error) {
      console.error(`Error occurred handling`, req.url, error);
      res.statusCode = 500;
      res.end(`Internal server error`);
    }
  }); // <-- properly closed createServer

  // 2. Attach Socket.io to the httpServer
  const io = new Server(httpServer, {
    path: `/api/socket`,
  });

  io.on("connection", (socket) => {
    console.log(`A client connected via WebSocket`);
  });

  // 3. Start listening for network traffic
  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    }) // <-- No semicolon here!
    .listen(port, () => {
      // Fixed the semicolon to a colon in the URL
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> WebSocket server ready`);
    });
};

// 4. Execute the function
startServer();
