import net from "node:net";

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Pass the Playwright server port to check.");
}

await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", () => reject(new Error(`Port ${port} is already in use. Stop the process that owns it, then rerun this command.`)));
  server.listen(port, "127.0.0.1", () => server.close(resolve));
});
